<script lang="ts">
    // Minimal inline icon set (Lucide geometry, currentColor) so the UI gets
    // crisp vector glyphs without an icon dependency. Add icons here as needed.
    type Props = { name: string; size?: number; class?: string };
    let { name, size = 16, class: klass = "" }: Props = $props();

    const paths: Record<string, string> = {
        plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
        settings:
            '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
        "chevron-down": '<path d="m6 9 6 6 6-6"/>',
        "chevron-right": '<path d="m9 18 6-6-6-6"/>',
        send: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
        stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
        copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        trash:
            '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
        zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        "panel-right": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
    };
</script>

<svg
    class={klass}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
>
    {@html paths[name] ?? ""}
</svg>
