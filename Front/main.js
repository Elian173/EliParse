document.addEventListener('DOMContentLoaded', () => {
    console.log("Main app router initializing...");

    // --- DOM Element References (For Navigation) ---
    const navLinks = document.querySelectorAll('.sidebar .nav-link');
    const appContents = document.querySelectorAll('.main-content .app-content');

    // --- App Initialization Functions ---
    // Store initialization functions for each app
    const appInitializers = {
        'app-boomi-profile': window.initBoomiUtilsApp, // Assumes initBoomiUtilsApp is globally available from boomiUtils.js
        'app-placeholder': initPlaceholderApp,
        // Add more app initializers here: 'app-id': initAppFunction
    };

    // --- Navigation Logic ---
    function switchApp(targetId) {
        console.log(`Attempting to switch to app: ${targetId}`);
        // Hide all app content sections
        appContents.forEach(content => content.classList.remove('active'));
        // Remove active class from all nav links
        navLinks.forEach(link => link.classList.remove('active'));

        // Find the target content and link
        const targetContent = document.getElementById(targetId);
        const targetLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);

        // Show the target content and highlight the link
        if (targetContent) {
            targetContent.classList.add('active');
            console.log(`Activated content: #${targetId}`);
        } else {
            console.error(`Content section not found for target: ${targetId}`);
        }

        if (targetLink) {
            targetLink.classList.add('active');
            console.log(`Activated link for target: ${targetId}`);
        } else {
             console.warn(`Navigation link not found for target: ${targetId}`);
        }

        // Run the initializer for the target app, if it exists
        if (appInitializers[targetId] && typeof appInitializers[targetId] === 'function') {
            try {
                appInitializers[targetId](); // Call the init function
            } catch (error) {
                console.error(`Error initializing app "${targetId}":`, error);
                // Optionally display an error message in the app's content area
                if(targetContent) {
                    targetContent.innerHTML = `<p style="color: red;">Error loading app: ${error.message}</p>`;
                }
            }
        } else {
            console.log(`No initializer function found for app: ${targetId}`);
        }
    }

    // Add click listeners to navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default anchor behavior
            const targetId = link.getAttribute('data-target');
            if (targetId) {
                switchApp(targetId);
            } else {
                console.warn("Clicked nav link is missing data-target attribute.");
            }
        });
    });

    // --- Placeholder App Logic ---
    function initPlaceholderApp() {
        console.log("Initializing Placeholder App 2...");
        const placeholderButton = document.getElementById('placeholder-button');
        if (placeholderButton) {
            // Remove previous listener if any (simple approach)
            placeholderButton.replaceWith(placeholderButton.cloneNode(true));
            // Re-select and add listener
            const newPlaceholderButton = document.getElementById('placeholder-button');
            newPlaceholderButton.addEventListener('click', () => {
                console.log("hello world");
                alert("Logged 'hello world' to the console!"); // Added alert for visual feedback
            });
            console.log("Placeholder App 2 Initialized.");
        } else {
            console.error("Placeholder button not found!");
        }
    }

    // --- Initialize: Show the first app by default ---
    const firstAppLink = document.querySelector('.sidebar .nav-link[data-target]');
    if (firstAppLink) {
        // Use setTimeout to ensure other scripts (like boomiUtils.js) have loaded
        // and defined their init functions before we try to call them.
        setTimeout(() => {
             switchApp(firstAppLink.getAttribute('data-target'));
             console.log("Initial app loaded.");
        }, 0);
    } else {
        console.warn("No initial app link found with data-target.");
    }

}); // End DOMContentLoaded
