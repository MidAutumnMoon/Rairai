<script lang="ts">
import { untrack } from "svelte";
import X from "@lucide/svelte/icons/x";
import ChevronUp from "@lucide/svelte/icons/chevron-up";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
import ChevronsDown from "@lucide/svelte/icons/chevrons-down";
import History from "@lucide/svelte/icons/history";

// The scroll container we mirror and navigate within.
let {
    container,
    messageCount,
}: { container: HTMLDivElement; messageCount: number } = $props();

const ICON = 16;

let expanded = $state(false);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;
let collapseTimer: ReturnType<typeof setTimeout> | null = null;

// --- Segments ------------------------------------------------------------
// A segment is a user message + the assistant reply that follows it.
// Each segment is a discrete mark on the bar; prev/next jumps between
// segment boundaries (user messages).
interface Segment {
    userEl: HTMLElement;
    assistantEl: HTMLElement | null;
}

let segments = $state<Segment[]>([]);
let activeSegment = $state(-1);

function rebuildSegments() {
    const els = Array.from(
        container.querySelectorAll<HTMLElement>(".msg"),
    );
    const segs: Segment[] = [];
    for (let i = 0; i < els.length; i++) {
        if (els[i].classList.contains("user")) {
            const next = els[i + 1];
            segs.push({
                userEl: els[i],
                assistantEl: next?.classList.contains("assistant")
                    ? next
                    : null,
            });
        }
    }
    segments = segs;
}

// Track scroll position to highlight the active segment. Wrapped in untrack
$effect(() => {
    const el = container;
    void messageCount; // re-run when messages are added/removed
    if (!el) return;
    untrack(() => {
        rebuildSegments();
        updateActive();
    });
    const onScroll = () => untrack(updateActive);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
});

function updateActive() {
    const c = container;
    if (!c || segments.length === 0) {
        activeSegment = -1;
        return;
    }
    const mid = c.scrollTop + c.clientHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const top = seg.userEl.offsetTop;
        const bottom = (seg.assistantEl ?? seg.userEl).offsetTop +
            (seg.assistantEl ?? seg.userEl).offsetHeight;
        const center = (top + bottom) / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    }
    activeSegment = best;
}

// --- Navigation ----------------------------------------------------------
async function scrollToSegment(i: number) {
    const c = container;
    if (!c || i < 0 || i >= segments.length) return;
    const seg = segments[i];
    const target = seg.assistantEl ?? seg.userEl;
    const cRect = c.getBoundingClientRect();
    const eRect = target.getBoundingClientRect();
    const offset = eRect.top - cRect.top + c.scrollTop;
    c.scrollTo({
        top: offset - c.clientHeight / 2 + eRect.height / 2,
        behavior: "smooth",
    });
    highlight(seg.userEl);
}

function highlight(el: HTMLElement) {
    el.classList.remove("jb-flash");
    void el.offsetWidth;
    el.classList.add("jb-flash");
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
        el.classList.remove("jb-flash");
        highlightTimer = null;
    }, 1600);
}

function jumpPrev() {
    if (activeSegment > 0) scrollToSegment(activeSegment - 1);
}
function jumpNext() {
    if (activeSegment >= 0 && activeSegment < segments.length - 1) {
        scrollToSegment(activeSegment + 1);
    }
}
function jumpTop() {
    if (segments.length) scrollToSegment(0);
}
function jumpBottom() {
    if (segments.length) scrollToSegment(segments.length - 1);
}

// History: jump to a segment at ~25% or ~75% of the conversation.
function jumpHistory() {
    if (segments.length < 4) return;
    const target = activeSegment < segments.length / 2
        ? Math.floor(segments.length * 0.75)
        : Math.floor(segments.length * 0.25);
    scrollToSegment(target);
}
</script>

<svelte:window onresize={updateActive} />

<div
    class="jumpbar"
    class:expanded
    role="group"
    aria-label="Message navigation"
    onmouseenter={() => {
        if (collapseTimer) {
            clearTimeout(collapseTimer);
            collapseTimer = null;
        }
        expanded = true;
    }}
    onmouseleave={() => {
        collapseTimer = setTimeout(() => (expanded = false), 200);
    }}
>
    {#if expanded}
        <div class="toolbar" role="toolbar" aria-label="Message navigation">
            <button
                class="jb-btn"
                onclick={() => (expanded = false)}
                aria-label="Close navigation"
                title="Close"
            >
                <X size={ICON} />
            </button>
            <div class="jb-sep"></div>
            <button
                class="jb-btn"
                onclick={jumpPrev}
                aria-label="Previous segment"
                title="Previous"
            >
                <ChevronUp size={ICON} />
            </button>
            <button
                class="jb-btn"
                onclick={jumpNext}
                aria-label="Next segment"
                title="Next"
            >
                <ChevronDown size={ICON} />
            </button>
            <div class="jb-sep"></div>
            <button
                class="jb-btn"
                onclick={jumpTop}
                aria-label="Jump to top"
                title="Top"
            >
                <ChevronsUp size={ICON} />
            </button>
            <button
                class="jb-btn"
                onclick={jumpBottom}
                aria-label="Jump to bottom"
                title="Bottom"
            >
                <ChevronsDown size={ICON} />
            </button>
            <div class="jb-sep"></div>
            <button
                class="jb-btn"
                onclick={jumpHistory}
                aria-label="Jump to earlier point"
                title="History"
            >
                <History size={ICON} />
            </button>
        </div>
    {/if}

    <div class="seg-bar" aria-label="Scroll position">
        {#each segments as seg, i}
            <button
                class="seg-mark"
                class:active={i === activeSegment}
                aria-label="Segment {i + 1}"
                onclick={() => scrollToSegment(i)}
            >
            </button>
            {#if i < segments.length - 1}
                <div class="seg-gap"></div>
            {/if}
        {/each}
    </div>
</div>

<style>
.jumpbar {
    position: absolute;
    top: 50%;
    right: 0.75rem;
    transform: translateY(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    /* Generous invisible hit area so hover is easy. */
    padding: 0.75rem 0.4rem;
}

/* --- Segmented bar (default state) --- */
.seg-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    flex: none;
}
.seg-mark {
    width: 5px;
    height: 18px;
    border: 0;
    padding: 0;
    border-radius: var(--r-full);
    background: var(--border);
    cursor: pointer;
    transition:
        background var(--transition),
        height var(--transition),
        opacity var(--transition);
}
.seg-mark:hover {
    background: var(--text-faint);
    height: 22px;
}
.seg-mark.active {
    background: var(--primary);
    opacity: 0.6;
}
.seg-mark.active:hover {
    opacity: 0.85;
}
.seg-gap {
    height: 3px;
    flex: none;
}

/* --- Toolbar (expanded) --- */
.toolbar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.3rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    box-shadow: var(--shadow);
    animation: pop 120ms ease-out;
}
@keyframes pop {
    from {
        opacity: 0;
        transform: scale(0.92) translateX(6px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateX(0);
    }
}
.jb-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--r-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition:
        background var(--transition),
        color var(--transition);
}
.jb-btn:hover {
    background: var(--surface-3);
    color: var(--text);
}
.jb-btn:active {
    background: var(--primary-soft);
    color: var(--primary);
}
.jb-sep {
    height: 1px;
    margin: 0.15rem 0.3rem;
    background: var(--border);
}

/* Landing flash on a jumped-to message. Global (not scoped) because the
+      target <article> lives in Message.svelte, outside this component. */
:global(.jb-flash) {
    animation: jb-flash 1.6s ease-out;
}
:global {
    @keyframes jb-flash {
        0% {
            box-shadow: 0 0 0 3px var(--primary-softer);
        }
        100% {
            box-shadow: 0 0 0 0 transparent;
        }
    }
}
</style>
