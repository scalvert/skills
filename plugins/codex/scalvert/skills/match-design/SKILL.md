---
name: match-design
description: Make a built page or component match its design by looking at both. Takes a screenshot of the build at the same size and state as the mockup, lists every difference with measurements, fixes them with the design system's own components and tokens, then takes a new screenshot before it says anything matches. Also reviews a page with a designer's eye when there is no mockup. Use when asked to match the mockup, make it pixel perfect, compare the design to the implementation, fix the spacing or alignment, or look at this as a designer.
---

# Match a design

Input: a reference (a mockup image, an exported frame or a design handoff folder) and the built view. Output: the view matching the reference, with before and after screenshots.

Never report that a view matches a design from reading the code. Look at it.

## Steps

### 1. Get the reference

Use the image or the handoff folder the user gave you. Read the design tokens and the specification when the handoff has them. When you only have a description, ask for the image.

Ask how exact the reference is. A final mockup is matched exactly. A rough wireframe shows layout and content only, and the visual details come from the design system and your judgment.

### 2. Render the build

Run the app. Open the same view in a browser, at the same viewport size and in the same state as the reference: the same data, theme, hover or open state. Take a screenshot.

When you cannot open a browser, say so and ask for access or for a screenshot. Do not guess from the styles.

### 3. List the differences

Compare the two images one region at a time. Check the whole view, including the parts the user did not point at.

| Check | What to compare |
|---|---|
| Layout | Order, alignment, widths, what is missing or extra |
| Spacing | Padding, margins and gaps, as measured values |
| Type | Family, size, weight, line height, letter spacing, case |
| Color | Text, background, border, gradient |
| Shape | Borders, radius, shadows, dividers |
| Images and icons | Size, crop, which asset |
| States | Disabled, locked, selected, empty |

Write each difference as: where, the reference value, the built value. "The header's letter spacing is 0.08em in the build and about 0.02em in the mockup" is a difference. "The header looks off" is not.

### 4. Fix with what exists

- Reuse the design system's components. Find the one the rest of the app uses for the same thing, and its standard sizes.
- Use tokens for color, spacing and type.
- Add custom CSS only when no component or token fits, and keep it small.
- Do not create a new component unless nothing existing can be made to fit.

Fix the differences. Do not restyle anything the reference does not show.

### 5. Look again

Take a new screenshot and repeat step 3. Go on until the list is empty, or until what remains has a reason, such as a font the design uses that the app does not ship.

### 6. Report

Show the reference, the before screenshot and the after screenshot. List each difference that remains and why.

## With no mockup

When the user asks for a designer's view, take a screenshot and review it for alignment, a consistent spacing rhythm, a clear order of importance, elements that compete for attention, and consistency with the rest of the site. List the problems with their location, most visible first, and propose a fix for each. Change nothing until the user picks.

## Done when

- A screenshot taken after the last change shows the view.
- Every difference is fixed, or listed with its reason.
- No new component or custom style was added where an existing one fits.
