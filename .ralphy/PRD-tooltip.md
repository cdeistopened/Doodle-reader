# PRD: Tooltip Spotlight Component

## Overview

Create a reusable tooltip spotlight component that highlights a UI element while dimming the rest of the screen. This is the foundation for the onboarding tutorial system.

---

## Tasks

### Task 1: Create SpotlightOverlay component

Create `components/SpotlightOverlay.tsx` with:

- Full-screen dark overlay (semi-transparent black)
- "Cutout" that highlights a target element (passed as ref or selector)
- Tooltip box with:
  - Title text
  - Description text
  - "Got it" dismiss button
  - Optional "Next" button for multi-step tours
- Smooth fade-in animation
- Click outside to dismiss (optional prop)
- Keyboard: Escape to dismiss

**Props interface:**
```typescript
interface SpotlightOverlayProps {
  targetSelector: string;        // CSS selector for element to highlight
  title: string;
  description: string;
  onDismiss: () => void;
  onNext?: () => void;           // For multi-step tours
  dismissOnClickOutside?: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}
```

### Task 2: Add spotlight positioning logic

The tooltip should intelligently position itself:
- Calculate target element's bounding rect
- Position tooltip to avoid viewport edges
- Draw cutout around target with small padding (8px)
- Handle window resize

### Task 3: Add CSS animations

In `index.css`, add:
- `.spotlight-overlay` fade-in animation
- `.spotlight-tooltip` slide-in animation
- `.spotlight-cutout` subtle pulse animation on the highlighted element

### Task 4: Create useSpotlight hook

Create `lib/hooks/useSpotlight.ts`:

```typescript
const { showSpotlight, hideSpotlight, isActive } = useSpotlight();

// Usage:
showSpotlight({
  targetSelector: '.add-feed-button',
  title: 'Add your first feed',
  description: 'Click here to subscribe to an RSS feed or newsletter.',
});
```

---

## Acceptance Criteria

- [ ] SpotlightOverlay renders correctly over any target element
- [ ] Tooltip positions itself to stay within viewport
- [ ] Escape key dismisses spotlight
- [ ] Smooth animations for show/hide
- [ ] Works on mobile (touch to dismiss)
- [ ] TypeScript compiles with no errors

---

## Design Reference

```
┌─────────────────────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░┌─────────────────┐░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░│  + Add Feed     │░░░░░░░░░░░░░░░░░░░░░░│  ← Highlighted
│░░░░░░░░░░░└─────────────────┘░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░        ▼          ░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░┌─────────────────────┐░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░│ Add your first feed │░░░░░░░░░░░░░░░░░░│  ← Tooltip
│░░░░░░░░░░░│                     │░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░│ Subscribe to RSS    │░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░│ feeds or newsletters│░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░│                     │░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░│        [Got it]     │░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░└─────────────────────┘░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└─────────────────────────────────────────────────────┘
  ░ = dimmed overlay
```

---

## Files to Create/Modify

- `components/SpotlightOverlay.tsx` (new)
- `lib/hooks/useSpotlight.ts` (new)
- `index.css` (add animations)

---

## Notes

- Follow existing modal patterns in the codebase
- Use Tailwind for styling where possible
- This component will be used by the onboarding system (doodle-reader-e6b)
