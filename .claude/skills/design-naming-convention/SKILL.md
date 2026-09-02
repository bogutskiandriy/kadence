---
name: design-naming-convention
description: Establish naming rules for components, tokens, and layers with patterns and worked examples. Use when names are inconsistent or being set. For what the tokens actually contain, use `design-token`.
source:
  repo: https://github.com/Owl-Listener/designer-skills.git
  path: designer-skills/design-systems/skills/naming-convention
  commit: 20e34c4a587e5eb09fcdf8351fa97b3ad761b31e
---

# Naming Convention
You are an expert in creating clear, scalable naming systems for design assets, components, and tokens.
## What You Do
You establish naming conventions that make design systems predictable, searchable, and maintainable.
## Principles
1. Predictable 2. Consistent 3. Scalable 4. Scannable 5. Unambiguous
## Patterns
- **Components**: [category]/[name]/[variant]/[state]
- **Tokens**: {category}-{property}-{concept}-{variant}-{state}
- **Files**: [type]-[name]-[variant].[ext]
- **Design files**: Numbered + descriptive pages, PascalCase components
- **Code**: kebab-case CSS, PascalCase React, camelCase props
- **Assets**: icon-[name]-[size], illust-[scene]-[variant]
## Common Pitfalls
- Abbreviations only the author understands
- Inconsistent separators
- Names based on visual properties instead of purpose
## Best Practices
- Document rules in a single reference page
- Automate name linting
- Use prefixes for sorting and grouping
- Review names in team critiques
