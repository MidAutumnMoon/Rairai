<script lang="ts">
    // A button with an optional tooltip. Provide `label` to get a hover tooltip
    // + aria-label; omit it for a plain button. Self-contained — each instance
    // brings its own Tooltip.Provider so no global provider is needed.
    import { Tooltip } from "bits-ui";
    import type { Snippet } from "svelte";

    interface Props {
        children: Snippet;
        label?: string;
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

{#if label}
    <Tooltip.Provider>
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
    </Tooltip.Provider>
{:else}
    <button class={klass} {onclick} {disabled}>
        {@render children()}
    </button>
{/if}
