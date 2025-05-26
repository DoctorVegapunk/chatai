<script>
  import { page } from '$app/stores';
  import "../app.css";
  
  let { children } = $props();
  
  // Use $derived for reactivity in runes mode
  let currentPath = $derived($page.url.pathname);
  
  const navItems = [
    { name: 'Home', href: '/' },
    { name: 'My Chats', href: '/chats' },
    { name: 'New Scenario', href: '/scenarios/new' },
  ];
</script>

<div class="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
  <!-- Navigation -->
  <nav class="bg-gray-800 border-b border-gray-700">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center">
          <div class="flex-shrink-0">
            <span class="text-xl font-bold text-indigo-400">ChatAI</span>
          </div>
          <div class="hidden md:block">
            <div class="ml-10 flex items-baseline space-x-4">
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
      </div>
    </div>
  </nav>

  <!-- Main content -->
  <main class="flex-1">
    {@render children()}
  </main>
  
  <!-- Footer -->
  <footer class="bg-gray-800 border-t border-gray-700 py-4">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-400 text-sm">
      &copy; 2025 ChatAI. All rights reserved.
    </div>
  </footer>
</div>