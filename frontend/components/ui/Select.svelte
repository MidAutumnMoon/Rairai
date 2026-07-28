<script lang="ts">
    // Thin wrapper over bits-ui Select so the ~20 lines of trigger/portal/
    // content/viewport/item boilerplate live once. Styles come from app.css
    // (.select-trigger / .select-content / .select-item).
    import { Select } from "bits-ui";
    import Icon from "./Icon.svelte";

    type Option = { value: string; label: string; disabled?: boolean };
    let {
        value = $bindable(""),
        items,
        placeholder = "Select…",
        class: klass = "",
    }: {
        value?: string;
        items: Option[];
        placeholder?: string;
        class?: string;
    } = $props();
</script>

<Select.Root type="single" {items} bind:value>
    <Select.Trigger class={`select-trigger ${klass}`}>
        <Select.Value {placeholder} />
        <Icon name="chevron-down" size={16} class="chev" />
    </Select.Trigger>
    <Select.Portal>
        <Select.Content class="select-content" sideOffset={6}>
            <Select.Viewport class="select-viewport">
                {#each items as it (it.value)}
                    <Select.Item
                        class="select-item"
                        value={it.value}
                        label={it.label}
                        disabled={it.disabled}
                    >
                        {#snippet children({ selected })}
                            <span>{it.label}</span>
                            {#if selected}
                                <span class="select-check"><Icon name="check" size={14} /></span>
                            {/if}
                        {/snippet}
                    </Select.Item>
                {/each}
            </Select.Viewport>
        </Select.Content>
    </Select.Portal>
</Select.Root>
