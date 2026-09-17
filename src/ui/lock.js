import { h, mount, button, textInput } from './components.js';
import { store } from '../store.js';

export function renderLock(root, { onUnlocked }) {
  let pin = '';
  let error = '';

  function render() {
    const content = h('div', { class: 'lock-screen' }, [
      h('div', { class: 'onboarding-logo' }, '🔒'),
      h('h1', {}, 'SmartBudget is locked'),
      h('p', { class: 'text-muted' }, 'Enter your PIN to unlock your budget.'),
      textInput({ type: 'password', value: pin, placeholder: 'PIN', oninput: (v) => (pin = v) }),
      error ? h('div', { class: 'field-error' }, error) : null,
      button('Unlock', {
        className: 'btn-block',
        onClick: async () => {
          try {
            await store.unlock(pin);
            onUnlocked();
          } catch {
            error = 'Incorrect PIN. Try again.';
            pin = '';
            render();
          }
        },
      }),
    ]);
    mount(root, content);
  }

  render();
}
