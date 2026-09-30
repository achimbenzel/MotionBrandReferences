# Styles

`base.css` holds what every page needs — the frame, sidebar, buttons, forms,
cards, dialogs, menus, the dashboard — and is loaded with the app
(`src/main.jsx`). Each area that loads on demand has its own file, imported at
the top of its pages, so its styles only load when you open it:

| File | Imported by |
| --- | --- |
| `reference.css` | `ProjectDetail`, `GalleryDetail` (a reference's page) |
| `plan.css` | `PlansPage`, `PlanDetail`, `StoryboardsPage`, `StoryboardEditor` |
| `mockups.css` | `MockupsPage`, `MockupOpen` |
| `content.css` | `ContentPage`, `ContentDetail` |
| `clients.css` | `ClientsPage`, `ClientDetail` |
| `software.css` | `SoftwarePage`, `SoftwareDetail` |
| `notes.css` | `NotesPage`, `NoteDetail` |
| `settings.css` | `SettingsPage`, `TrashPage` |
| `time.css`, `expenses.css`, `achievements.css`, `board.css`, `inbox.css`, `logotester.css` | their page |

Rules of thumb:

- A class used by anything that's always loaded (the sidebar, a dialog, the
  dashboard and its widgets, cards) belongs in `base.css` — even if it's
  named after an area (the dashboard shows achievement cards and the time
  tracker's pill, so those styles are in `base.css`).
- An area file comes after `base.css`, so its rules win over base rules of the
  same weight. A base rule that must beat an area rule (e.g. "on touch
  screens, show what's otherwise shown on hover") goes in the area's file,
  after the rule it overrides.
