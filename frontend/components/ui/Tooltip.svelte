<script lang="ts">
    // Thin wrapper over bits-ui Tooltip. Requires a Tooltip.Provider ancestor
    // (App wraps its content in one). Renders the trigger as a button carrying
    // the caller's class (e.g. "btn btn-icon") + an icon/label snippet.
    // onclick/disabled forward to that trigger button so icon-button tooltips
    // stay interactive without a nested <button>.
    import { Tooltip } from "bits-ui";
    import type { Snippet } from "svelte";

    interface Props {
        label: string;
        children: Snippet;
        class?: string;
        onclick?: (e: MouseEvent) => void;
        disabled?: boolean;
    }

    let {
        label,
        children,
        class: klass = "",
        onclick,
        disabled,
    }: Props = $props();
</script>

<Tooltip.Root>
    <Tooltip.Trigger class={klass} {onclick} {disabled} aria-label={label}>
        {@render children()}
    </Tooltip.Trigger>
    <Tooltip.Portal>
        <Tooltip.Content class="tooltip-content" sideOffset={6}>
            {label}
            <Tooltip.Arrow class="tooltip-arrow" />
        </Tooltip.Content>
    </Tooltip.Portal>
</Tooltip.Root>
