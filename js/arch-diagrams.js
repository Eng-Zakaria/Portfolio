/**
 * Interactive Architecture Diagram Component
 *
 * Usage: Add class "arch-diagram-interactive" to any .arch-diagram element.
 * The component handles tooltips, hover states, and mobile tap interactions.
 */

(function() {
  'use strict';

  // Tooltip element (created once, reused)
  let tooltip = null;

  function createTooltip() {
    tooltip = document.createElement('div');
    tooltip.className = 'arch-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function getOrCreateTooltip() {
    return tooltip || createTooltip();
  }

  function showTooltip(node, event) {
    const tooltip = getOrCreateTooltip();
    const detail = node.getAttribute('data-detail');
    const tech = node.getAttribute('data-tech');

    if (!detail) return;

    let html = `<div class="arch-tooltip-content">
      <div class="arch-tooltip-title">${node.textContent.trim()}</div>`;

    if (detail) {
      html += `<div class="arch-tooltip-detail">${detail}</div>`;
    }

    if (tech) {
      html += `<div class="arch-tooltip-tech">${tech}</div>`;
    }

    html += '</div>';
    tooltip.innerHTML = html;
    tooltip.classList.add('visible');
    tooltip.setAttribute('aria-hidden', 'false');

    positionTooltip(tooltip, node, event);
  }

  function positionTooltip(tooltip, node, event) {
    const rect = node.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 10;

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.bottom + padding;

    // Keep within viewport
    if (left < padding) left = padding;
    if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }
    if (top + tooltipRect.height > window.innerHeight) {
      top = rect.top - tooltipRect.height - padding;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
    }
  }

  function initInteractiveDiagram(diagram) {
    const nodes = diagram.querySelectorAll('.arch-node');

    nodes.forEach(node => {
      // Hover events
      node.addEventListener('mouseenter', (e) => showTooltip(node, e));
      node.addEventListener('mousemove', (e) => {
        if (tooltip.classList.contains('visible')) {
          positionTooltip(tooltip, node, e);
        }
      });
      node.addEventListener('mouseleave', hideTooltip);

      // Touch/click events for mobile
      node.addEventListener('click', (e) => {
        e.preventDefault();
        if (tooltip.classList.contains('visible') && tooltip.dataset.activeNode === node.getAttribute('data-node-id')) {
          hideTooltip();
        } else {
          showTooltip(node, e);
          tooltip.dataset.activeNode = node.getAttribute('data-node-id');
        }
      });

      // Keyboard accessibility
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.addEventListener('focus', (e) => showTooltip(node, e));
      node.addEventListener('blur', hideTooltip);
    });
  }

  // Initialize all interactive diagrams on page load
  document.addEventListener('DOMContentLoaded', () => {
    const diagrams = document.querySelectorAll('.arch-diagram-interactive');
    diagrams.forEach(initInteractiveDiagram);
  });

  // Also handle dynamically loaded content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          if (node.classList && node.classList.contains('arch-diagram-interactive')) {
            initInteractiveDiagram(node);
          }
          const diagrams = node.querySelectorAll('.arch-diagram-interactive');
          diagrams.forEach(initInteractiveDiagram);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

})();
