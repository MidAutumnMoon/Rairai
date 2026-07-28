// Shared, reactive application state.
//
// The `.svelte.ts` suffix lets this module use Svelte 5 runes ($state) outside
// of a .svelte component. Import `appState` anywhere; mutating its fields
// (e.g. `appState.count++`) reactively updates every component that reads it.
//
// Add new shared state as fields/methods on the AppState class below.

interface User {
    name: string;
}

class AppState {
    count = $state(0);
    user = $state<User | null>(null);

    increment() {
        this.count++;
    }

    login(name: string) {
        this.user = { name };
    }

    logout() {
        this.user = null;
    }
}

export const appState = new AppState();
