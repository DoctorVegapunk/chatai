import { writable } from 'svelte/store';

// Start with navbar collapsed by default
export const navbarCollapsed = writable(true);

// Export a function to toggle the navbar state
export function toggleNavbar() {
  navbarCollapsed.update(n => !n);
}
