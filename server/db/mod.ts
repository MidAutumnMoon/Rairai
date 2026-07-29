// Barrel: re-exports all DB domain modules so callers import from one place.
// The split is by entity domain (providers, settings, assistants, conversations,
// bootstrap); each file imports the query helpers from ./client.ts.

export {
    createProvider,
    deleteProvider,
    getProvider,
    listProviders,
    resolveProviderKey,
    setProviderModels,
    updateProvider,
} from "./providers.ts";

export { getSettings, updateSettings } from "./settings.ts";

export {
    createAssistant,
    deleteAssistant,
    getAssistant,
    listAssistants,
    updateAssistant,
} from "./assistants.ts";

export {
    addMessage,
    createConversation,
    deleteConversation,
    getConversation,
    getConversationPage,
    getMessagesBefore,
    listConversations,
    NEW_CHAT_TITLE,
    touchConversation,
    updateConversationTitle,
} from "./conversations.ts";

export {
    ensureBootstrapAssistant,
    ensureBootstrapProvider,
} from "./bootstrap.ts";
