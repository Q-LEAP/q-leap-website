# CLAUDE.md

## Project Overview

This project is the complete migration of the existing WordPress website:

**https://q-leap.eu/**

The objective is to completely remove the WordPress dependency and maintain the website exclusively through:

* Git
* Claude Code
* HTML
* CSS
* JavaScript

The final website must be visually and functionally indistinguishable from the original.

---

# Core Philosophy

This project is **not a redesign**.

It is **not a modernization**.

It is **not a refactor for the sake of refactoring**.

Every decision must preserve the current website unless explicitly requested otherwise.

If something already works correctly, do not change it.

---

# Primary Objective

Whenever working on this project, your priorities are:

1. Preserve the existing design.
2. Preserve existing functionality.
3. Preserve existing animations.
4. Preserve responsiveness.
5. Improve maintainability without changing the user experience.

If a conflict exists between "cleaner code" and "identical behavior", identical behavior always wins.

---

# Tech Stack

Allowed technologies:

* HTML5
* CSS3
* Vanilla JavaScript (ES6+)

Allowed external libraries only when absolutely necessary and explicitly justified.

Forbidden by default:

* WordPress
* PHP
* Elementor
* Divi
* WPBakery
* jQuery
* React
* Vue
* Angular
* Svelte
* TailwindCSS
* Bootstrap

Do not introduce new dependencies unless there is no reasonable alternative.

---

# Architecture

Project structure should remain organized.

Example:

```
/
│
├── index.html
├── pages/
├── components/
├── assets/
│   ├── css/
│   ├── js/
│   ├── images/
│   ├── icons/
│   ├── fonts/
│   └── videos/
│
├── docs/
├── README.md
└── CLAUDE.md
```

Keep assets organized.

Avoid unnecessary nesting.

---

# Development Rules

Always:

* Write readable code.
* Keep files organized.
* Remove dead code.
* Prefer reusable components.
* Reuse existing utilities before creating new ones.
* Use semantic HTML.
* Keep CSS modular.
* Keep JavaScript modular.

Avoid:

* Duplicated code.
* Magic numbers.
* Inline styles.
* Inline JavaScript.
* Global variables whenever possible.

---

# Visual Fidelity

This project requires pixel-perfect fidelity.

Do NOT change:

* Typography
* Colors
* Shadows
* Border radius
* Gradients
* Icons
* Images
* Layout
* Margins
* Padding
* Alignment
* Component sizes

Everything must remain visually identical unless explicitly requested.

---

# Animations

Animations are part of the product identity.

Never replace or simplify them.

Reproduce:

* Hover effects
* Scroll animations
* Hero animations
* Button animations
* Loading animations
* Menu transitions
* Cards
* Carousels
* Accordions
* Counters

Animation timing should remain consistent.

---

# Responsive Design

Every page must work correctly on:

* Desktop
* Laptop
* Tablet
* Mobile

Never fix desktop while breaking mobile.

Always verify responsiveness after modifications.

---

# Accessibility

Every page should respect:

* Semantic HTML
* Proper heading hierarchy
* Keyboard navigation
* Focus visibility
* ARIA labels when needed
* Accessible forms

Accessibility improvements should never visually alter the design unless explicitly requested.

---

# Performance

Performance is important.

Prefer:

* Optimized images
* Lazy loading
* Efficient CSS
* Minimal JavaScript
* Reduced layout shifts

Target Lighthouse score:

* Performance ≥ 95
* Accessibility ≥ 95
* Best Practices ≥ 95
* SEO ≥ 95

---

# SEO

Preserve:

* Meta titles
* Meta descriptions
* Canonical URLs
* Open Graph tags
* Twitter cards
* Structured data
* Sitemap compatibility
* Robots directives

Do not accidentally remove SEO metadata.

---

# Code Style

Use meaningful names.

Prefer descriptive variables over abbreviations.

Example:

Good:

```
heroAnimationDuration
```

Bad:

```
animDur
```

Functions should have one clear responsibility.

---

# Before Editing

Before modifying anything significant:

1. Understand the existing implementation.
2. Analyze impacts.
3. Reuse existing code when possible.
4. Modify only what is necessary.

Never rewrite an entire file if a localized modification is sufficient.

---

# Git Philosophy

Every modification should be logical and isolated.

Avoid massive unrelated changes.

When appropriate:

* explain the intended modification
* implement it
* verify it

---

# Debugging

When a bug appears:

1. Identify the root cause.
2. Do not apply temporary hacks.
3. Fix the underlying issue.
4. Ensure no regression is introduced.

---

# Documentation

Whenever creating an important component:

* keep the code readable
* make it reusable
* document non-obvious behavior

Avoid unnecessary comments.

Comments should explain "why", not "what".

---

# Forbidden Behaviors

Never:

* Redesign pages.
* Simplify the UI.
* Change branding.
* Change spacing.
* Change colors.
* Replace fonts.
* Introduce random dependencies.
* Rename files without reason.
* Rename CSS classes without reason.
* Break existing responsiveness.
* Remove animations.
* Delete code without understanding its purpose.

---

# Expected Workflow

For every request:

1. Analyze the existing code.
2. Understand the objective.
3. Propose the smallest reliable implementation.
4. Implement cleanly.
5. Verify desktop.
6. Verify tablet.
7. Verify mobile.
8. Ensure no regression.

---

# Golden Rule

When in doubt:

**Preserve the existing website.**

The objective of this repository is to faithfully reproduce and maintain the original Q-Leap website while making it easier to manage through clean HTML, CSS, JavaScript, Git, and Claude Code.

Every decision should move the project toward a maintainable codebase without changing the experience delivered to users.

# Mandatory Documentation

Before starting ANY task, always read and follow the documentation located in:

/docs/

The documentation is part of the project instructions.

Always consult, when relevant:

- docs/design-system.md
- docs/development-rules.md
- docs/architecture.md
- docs/roadmap.md

These documents have higher priority than assumptions.

Never ignore them.