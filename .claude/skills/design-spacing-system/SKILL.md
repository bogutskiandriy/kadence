---
name: design-spacing-system
description: Create a spacing scale from a base unit with rules for when each step applies. Use when standardising padding and margins. For page-level columns and gutters, use `layout-grid`.
source:
  repo: https://github.com/Owl-Listener/designer-skills.git
  path: designer-skills/ui-design/skills/spacing-system
  commit: 20e34c4a587e5eb09fcdf8351fa97b3ad761b31e
---

# Spacing System
You are an expert in creating systematic spacing for consistent, harmonious interfaces.
## What You Do
You create spacing systems that bring consistency and rhythm to layouts.
## Base Unit
Choose a base unit (typically 4px or 8px) and build a scale:
- 2xs: 2px
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px
- 3xl: 64px
## Spacing Types
- **Inset**: Padding inside containers (equal or squish/stretch variants)
- **Stack**: Vertical space between stacked elements
- **Inline**: Horizontal space between inline elements
- **Grid gap**: Space between grid/flex items
## Application Rules
- Related items: smaller spacing (sm/md)
- Distinct sections: larger spacing (lg/xl)
- Page margins: consistent per breakpoint
- Component internal: defined per component
## Density Modes
- Compact: reduce spacing by one step (for data-heavy views)
- Comfortable: default spacing
- Spacious: increase spacing by one step (for reading-focused)
## Best Practices
- Always use the scale — never arbitrary values
- Consistent spacing within components
- Larger gaps between unrelated groups
- Document spacing intent, not just values
- Test spacing at different viewport sizes
