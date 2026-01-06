## Overview
- Add a skills entry in the chat header toolbar: an icon button that toggles a dropdown listing current skills.
- Fetch skills from the existing API and show name + description; cached locally with manual refresh.

## API
- Use `GET http://localhost:3334/api/skills/manifest` (already available) and parse `{ skills: [{ key, name, description }] }`.
- Handle loading, error, and empty list states.

## UI Changes
- Header toolbar: add a right-aligned container with a "技能" icon button.
- Dropdown panel: anchored under the button; card-style list with compact items.
- Each item shows:
  - Primary: `name` (fallback to `key`)
  - Secondary: `description`
- Optional actions: a small "插入" button to append `name` to the input field (non-blocking; can be added inline).

## State & Logic
- `skillsOpen` (boolean) to toggle dropdown.
- `skills` (array) to store fetched skills; `skillsLoading` and `skillsError` for status.
- `fetchSkills()`:
  - On first open: fetch and cache.
  - On subsequent opens: use cache; provide a "刷新" icon to re-fetch.
- Close dropdown on outside click or Escape.

## Rendering & Styles
- Match existing minimal/clean styling: small font, subtle borders, hover states.
- Compact horizontal layout per item; truncate long text.
- Keep status dot pattern consistent if needed (not required).

## UX Details
- Tooltip on the icon: "技能"。
- Loading state text: "加载中…"；错误状态："加载失败"。
- Empty state: "暂无技能"。
- Keyboard: Enter on item inserts skill name into input (optional), Escape closes panel.

## Edge Cases
- Network failure: show error, offer "重试"。
- Duplicate names: display `name` and fall back to `key` for uniqueness.
- CORS already enabled on backend; no backend change required.

## Implementation Notes
- Implement entirely in `frontend/src/App.vue` using existing patterns (refs, fetch, minimal CSS). No comments in code.
- Avoid adding new dependencies; use native `fetch` and Vue `ref`.

## Optional Enhancements (later)
- Persist last-open state.
- Add quick filter search in the dropdown.
- Pin favorite skills to top.
