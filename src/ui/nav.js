import { h } from './components.js';

const TABS = [
  { path: '#/home', icon: '🏠', label: 'Home' },
  { path: '#/analytics', icon: '📊', label: 'Analytics' },
  { path: '#/add-expense', icon: '➕', label: 'Add', isFab: true },
  { path: '#/goals', icon: '🎯', label: 'Goals' },
  { path: '#/settings', icon: '⚙️', label: 'More' },
];

export function renderBottomNav(activeHash) {
  return h('nav', { class: 'bottom-nav' }, TABS.map((tab) => {
    const isActive = activeHash === tab.path || (tab.path === '#/settings' && ['#/recurring', '#/settings'].includes(activeHash));
    return h('a', {
      href: tab.path,
      class: `nav-item ${tab.isFab ? 'nav-fab' : ''} ${isActive ? 'nav-active' : ''}`,
    }, [
      h('span', { class: 'nav-icon' }, tab.icon),
      h('span', { class: 'nav-label' }, tab.label),
    ]);
  }));
}

export const HIDDEN_NAV_ROUTES = ['#/onboarding', '#/rule-select', '#/lock'];
