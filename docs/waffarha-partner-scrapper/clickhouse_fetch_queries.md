# ClickHouse Fetch Queries for Price Integrity Pipeline

## Schema Analysis Summary

| Table | Relevant Columns for Pipeline | Key Notes |
|-------|------------------------------|-----------|
| `main.dim_partners` | `part_id`, `part_name_en`, `part_name_ar`, `part_website`, `part_facebook`, `part_facebook2`, `instagram`, `part_tel`, `part_address_en`, `part_address_ar`, `status`, `partner_category_id` | Has website, social links, contact info. No `deleted_at` - use `status` for filtering. |
| `main.dim_offers` | `offer_id`, `part_id`, `product_name`, `product_code`, `actual_value` (VAT-inclusive), `offer_value`, `offer_discount`, `offer_brief_en/ar`, `offer_status`, `offer_start_date`, `offer_expire_date`, `sub_category_ids`, `sold_coupons_count_status`, `vat_included` | `vat_included` = 1 confirmed. `offer_status` for active filtering. `sub_category_ids` is comma-separated string. |
| `main.dim_type_price` | `type_price_id`, `offer_id`, `type_price_name`, `type_price_name_ar`, `type_price_price`, `status` | Each tier needs independent price check. |
| `main.coupons_new` / `main.fct_coupons` | `offer_id`, `type_price_id`, `coupon_sold_price`, `sold_coupons_count` (aggregated) | Use for coupon volume prioritization. `fct_coupons` has `partner_id` denormalized. |
| `main.dim_date` | Date dimension for filtering | Optional - can filter in Python instead. |

---

## Optimized Fetch Queries

### 1. Active Partners with Online Presence (Stage 0: Reachability Audit)

```sql
-- Fetch all potentially checkable partners
SELECT
    part_id,
    part_name_en,
    part_name_ar,
    part_website,
    part_facebook,
    part_facebook2,
    instagram,
    part_tel,
    part_address_en,
    part_address_ar,
    status,
    partner_category_id
FROM main.dim_partners
WHERE status IN ('active', 'Active', 'ACTIVE')
  AND (part_website IS NOT NULL AND part_website != ''
       OR part_facebook IS NOT NULL AND part_facebook != ''
       OR instagram IS NOT NULL AND instagram != '')
ORDER BY part_id
```

**Expected**: ~few hundred rows, very fast.

---

### 2. Active Offers with Type Price Tiers & Coupon Volume (Stage 1: Ingestion)

```sql
-- Main ingestion query: Active offers with type prices and coupon volumes
WITH active_offers AS (
    SELECT
        o.offer_id,
        o.part_id,
        o.product_name,
        o.product_code,
        o.actual_value,
        o.offer_value,
        o.offer_discount,
        o.offer_brief_en,
        o.offer_brief_ar,
        o.offer_status,
        o.offer_start_date,
        o.offer_expire_date,
        o.sub_category_ids,
        o.sold_coupons_count_status,
        o.vat_included,
        tp.type_price_id,
        tp.type_price_name,
        tp.type_price_name_ar,
        tp.type_price_price,
        tp.status AS type_price_status
    FROM main.dim_offers o
    LEFT JOIN main.dim_type_price tp
        ON tp.offer_id = o.offer_id
        AND tp.status = 1  -- active type prices only
    WHERE o.offer_status IN ('active', 'Active', 'ACTIVE')
      AND o.vat_included = 1
      AND o.deleted_at IS NULL
      AND o.offer_expire_date >= now() - INTERVAL 30 DAY  -- Configurable lookback
),
coupon_volumes AS (
    SELECT
        offer_id,
        type_price_id,
        COUNT(*) AS sold_coupons_count,
        AVG(coupon_sold_price) AS avg_sold_price,
        SUM(coupon_sold_price) AS total_revenue
    FROM main.fct_coupons
    WHERE coupon_status IN (1, 2, 3)  -- Active/sold/used statuses - adjust as needed
      AND created_at >= now() - INTERVAL 90 DAY  -- Recent volume window
    GROUP BY offer_id, type_price_id
)
SELECT
    ao.*,
    COALESCE(cv.sold_coupons_count, 0) AS sold_coupons_count,
    cv.avg_sold_price,
    cv.total_revenue
FROM active_offers ao
LEFT JOIN coupon_volumes cv
    ON cv.offer_id = ao.offer_id
    AND (cv.type_price_id = ao.type_price_id OR (cv.type_price_id IS NULL AND ao.type_price_id IS NULL))
ORDER BY ao.sold_coupons_count_status DESC, ao.part_id, ao.offer_id
```

**Expected**: ~thousands of offer-tier combinations. Use `clickhouse-connect` streaming for memory efficiency.

---

### 3. Coupon Volume by Offer (Alternative Simpler Query)

```sql
-- Quick coupon volume for prioritization only
SELECT
    offer_id,
    type_price_id,
    COUNT(*) AS sold_coupons_count,
    SUM(coupon_sold_price) AS total_revenue
FROM main.fct_coupons
WHERE created_at >= now() - INTERVAL 60 DAY
GROUP BY offer_id, type_price_id
ORDER BY sold_coupons_count DESC
```

---

### 4. Partner-Inclusive View for Reporting

```sql
-- Denormalized view for report generation
SELECT
    o.offer_id,
    o.part_id,
    p.part_name_en,
    p.part_name_ar,
    p.part_website,
    p.part_facebook,
    p.instagram,
    p.part_address_en,
    p.part_address_ar,
    o.product_name,
    o.product_code,
    o.actual_value,
    o.offer_value,
    o.offer_brief_en,
    o.offer_brief_ar,
    o.offer_status,
    o.offer_expire_date,
    o.sub_category_ids,
    o.sold_coupons_count_status,
    tp.type_price_id,
    tp.type_price_name,
    tp.type_price_name_ar,
    tp.type_price_price,
    cv.sold_coupons_count,
    cv.avg_sold_price
FROM main.dim_offers o
JOIN main.dim_partners p ON p.part_id = o.part_id
LEFT JOIN main.dim_type_price tp ON tp.offer_id = o.offer_id AND tp.status = 1
LEFT JOIN (
    SELECT offer_id, type_price_id, COUNT(*) AS sold_coupons_count, AVG(coupon_sold_price) AS avg_sold_price
    FROM main.fct_coupons
    WHERE created_at >= now() - INTERVAL 60 DAY
    GROUP BY offer_id, type_price_id
) cv ON cv.offer_id = o.offer_id AND cv.type_price_id = tp.type_price_id
WHERE o.offer_status IN ('active', 'Active', 'ACTIVE')
  AND o.vat_included = 1
  AND o.deleted_at IS NULL
  AND o.offer_expire_date >= now() - INTERVAL 30 DAY
  AND p.status IN ('active', 'Active', 'ACTIVE')
ORDER BY cv.sold_coupons_count DESC NULLS LAST
```

---

## Python Integration (`src/data_sources/clickhouse.py`)

```python
import clickhouse_connect
from typing import List, Optional
from dataclasses import dataclass

@dataclass
class ClickHouseConfig:
    host: str = "localhost"
    port: int = 8123
    username: str = "default"
    password: str = ""
    database: str = "main"

class ClickHouseDataSource:
    def __init__(self, config: ClickHouseConfig):
        self.client = clickhouse_connect.get_client(
            host=config.host,
            port=config.port,
            username=config.username,
            password=config.password,
            database=config.database,
        )

    def get_partners_for_audit(self) -> List[Partner]:
        """Stage 0: All partners with potential web presence"""
        query = """
        SELECT part_id, part_name_en, part_name_ar, part_website,
               part_facebook, part_facebook2, instagram,
               part_tel, part_address_en, part_address_ar,
               status, partner_category_id
        FROM main.dim_partners
        WHERE status IN ('active', 'Active', 'ACTIVE')
          AND (part_website IS NOT NULL AND part_website != ''
               OR part_facebook IS NOT NULL AND part_facebook != ''
               OR instagram IS NOT NULL AND instagram != '')
        ORDER BY part_id
        """
        rows = self.client.query(query).result_rows
        return [Partner(
            part_id=r[0], part_name_en=r[1], part_name_ar=r[2],
            part_website=r[3], part_facebook=r[4], part_facebook2=r[5],
            instagram=r[6], part_tel=r[7], part_address_en=r[8],
            part_address_ar=r[9], status=r[10], partner_category_id=r[11]
        ) for r in rows]

    def get_active_offers_with_tiers(self, lookback_days: int = 30) -> List[Offer]:
        """Stage 1: Active offers with type_price tiers and coupon volumes"""
        query = f"""
        WITH active_offers AS (
            SELECT
                o.offer_id, o.part_id, o.product_name, o.product_code,
                o.actual_value, o.offer_value, o.offer_discount,
                o.offer_brief_en, o.offer_brief_ar, o.offer_status,
                o.offer_start_date, o.offer_expire_date,
                o.sub_category_ids, o.sold_coupons_count_status, o.vat_included,
                tp.type_price_id, tp.type_price_name, tp.type_price_name_ar,
                tp.type_price_price, tp.status AS type_price_status
            FROM main.dim_offers o
            LEFT JOIN main.dim_type_price tp
                ON tp.offer_id = o.offer_id AND tp.status = 1
            WHERE o.offer_status IN ('active', 'Active', 'ACTIVE')
              AND o.vat_included = 1
              AND o.deleted_at IS NULL
              AND o.offer_expire_date >= now() - INTERVAL {lookback_days} DAY
        ),
        coupon_volumes AS (
            SELECT
                offer_id, type_price_id,
                COUNT(*) AS sold_coupons_count,
                AVG(coupon_sold_price) AS avg_sold_price,
                SUM(coupon_sold_price) AS total_revenue
            FROM main.fct_coupons
            WHERE created_at >= now() - INTERVAL 60 DAY
            GROUP BY offer_id, type_price_id
        )
        SELECT
            ao.offer_id, ao.part_id, ao.product_name, ao.product_code,
            ao.actual_value, ao.offer_value, ao.offer_discount,
            ao.offer_brief_en, ao.offer_brief_ar, ao.offer_status,
            ao.offer_start_date, ao.offer_expire_date,
            ao.sub_category_ids, ao.sold_coupons_count_status, ao.vat_included,
            ao.type_price_id, ao.type_price_name, ao.type_price_name_ar,
            ao.type_price_price, ao.type_price_status,
            COALESCE(cv.sold_coupons_count, 0) AS sold_coupons_count,
            cv.avg_sold_price, cv.total_revenue
        FROM active_offers ao
        LEFT JOIN coupon_volumes cv
            ON cv.offer_id = ao.offer_id
            AND (cv.type_price_id = ao.type_price_id OR (cv.type_price_id IS NULL AND ao.type_price_id IS NULL))
        ORDER BY ao.sold_coupons_count_status DESC, ao.part_id, ao.offer_id
        """
        rows = self.client.query(query).result_rows
        # Map rows to Offer + TypePrice objects
        return self._rows_to_offers(rows)
```

---

## JSON Snapshot Fallback Format

When DB is unavailable, the pipeline expects these JSON files:

### `offers_raw.json`
```json
[
  {
    "offer_id": 12345,
    "part_id": 678,
    "product_name": "Spa Package",
    "product_code": "SPA-001",
    "actual_value": 500.0,
    "offer_value": 800.0,
    "offer_discount": 37,
    "offer_brief_en": "Relaxing spa day...",
    "offer_brief_ar": "يوم سبا مريح...",
    "offer_status": "active",
    "offer_expire_date": "2026-12-31T23:59:59",
    "sub_category_ids": "1,5,12",
    "sold_coupons_count_status": 150,
    "vat_included": 1,
    "data_source": "json_snapshot"
  }
]
```

### `type_prices.json`
```json
[
  {
    "type_price_id": 999,
    "offer_id": 12345,
    "type_price_name": "Weekday Package",
    "type_price_name_ar": "باقة أيام الأسبوع",
    "type_price_price": 450.0,
    "status": 1
  }
]
```

---

## Key Implementation Notes

1. **Deduplication Key**: `offer_id` + `type_price_id` (or base offer when `type_price_id` is NULL)
2. **Priority Order**: `sold_coupons_count` (from `fct_coupons`) > `sold_coupons_count_status` (from `dim_offers`)
3. **VAT Handling**: `vat_included = 1` confirmed in `dim_offers`; scraped prices must be validated for VAT inclusion
4. **Lookback Window**: Configurable (default 30 days) for `offer_expire_date` filter
5. **Coupon Volume Window**: 60-90 days recommended for statistical relevance
6. **Connection Pooling**: Use `clickhouse-connect` with connection pooling for Airflow task retries