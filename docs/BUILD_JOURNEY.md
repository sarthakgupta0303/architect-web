# How Architect 2.0 Was Built

A short, step-by-step story of how this project went from an idea to a working app.

1. **Researched the market.** Looked at tools like Lovable, Bolt, Replit, v0, Cursor and the original Architect to learn what works and what's missing.
2. **Wrote the product plan.** Described who it's for, every screen, and how each step leads to the next.
3. **Wrote the engineering plan.** Chose the technology and designed the database, the APIs and the security approach.
4. **Set up the project.** Started a Next.js app and connected it to Supabase.
5. **Wrote detailed specs.** One guide per feature, plus the database design and a design system (colours, fonts, light and dark mode).
6. **Built the app.** Every screen has proper loading, empty and error states.
7. **Made database setup easy.** Put everything into a single `database.sql` file.
8. **Ran it locally.** Got it working on `localhost:3000`.
9. **Fixed missing pages and buttons.** Built every page that returned 404 and wired up every button.
10. **Added chat memory.** The assistant remembers the conversation and shows where each answer came from.
11. **Improved security.** Added database access rules, rate limits, AI safety checks and file upload checks.
12. **Fixed a live-sync bug** on the agent board.
13. **Finished the remaining pages:** Templates, Integrations, Studio, Settings and invites.
14. **Redesigned the homepage,** with a clear message and an animated demo.
15. **Connected more features to real data:** tests (evals), the data viewer, deploys, secrets and domains, plus a live view of each step the builder takes.
16. **Tested everything automatically.** A browser robot visited 49 pages and clicked 364 buttons, and the issues it found were fixed.
17. **Fixed sign-up.** Email accounts now work right away. The Google and GitHub buttons explain how to turn them on.
18. **Published to GitHub,** making sure no private keys were ever uploaded.
