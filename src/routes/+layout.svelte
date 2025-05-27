<script>
  import { page } from '$app/stores';
  import { navbarCollapsed } from '$lib/stores/navbar';
  import "../app.css";
  
  let { children } = $props();
  
  // Use $derived for reactivity in runes mode
  let currentPath = $derived($page.url.pathname);
  let isNavbarCollapsed = $derived($navbarCollapsed);
  
  const navItems = [
    { name: 'Home', href: '/' },
    { name: 'My Chats', href: '/chats' },
    { name: 'New Scenario', href: '/scenarios/new' },
  ];
</script>

<div class="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
  <!-- Navigation -->
  <nav class="bg-gray-800 border-b border-gray-700 transition-all duration-300 ease-in-out overflow-hidden {isNavbarCollapsed ? 'h-0' : 'h-14'}">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
      <div class="flex items-center h-full space-x-6">
        <div class="flex-shrink-0">
          <span class="text-xl font-bold text-indigo-400">ChatAI</span>
        </div>
        <div class="flex-1 flex items-center space-x-1">
          {#each navItems as item}
            <a
              href={item.href}
              class="px-3 py-2 rounded-md text-sm font-medium {currentPath === item.href 
                ? 'bg-gray-900 text-white' 
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'}"
            >
              {item.name}
            </a>
          {/each}
        </div>
      </div>
    </div>
  </nav>

  <!-- Main content -->
  <main class="flex-1 overflow-hidden">
    <div class="h-full">
      {@render children()}
    </div>
  </main>
  
  <!-- Footer -->
  <footer class="bg-gray-800 border-t border-gray-700 py-4">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400 text-sm">
      &copy; 2025 ChatAI. All rights reserved.
    </div>
  </footer>
</div>