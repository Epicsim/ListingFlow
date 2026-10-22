# ListingFlow visual system

Updated 2026-10-21. Applies to the existing application, home page and account screens.

Reference: https://www.aistetic.com/listingflow. Use its spacious composition,
strong sans-serif hierarchy, pale surfaces and restrained blue accent. Product
copy and workflows remain specific to real estate agents.

- Inter for headings and body; clear weight hierarchy and generous line height.
- Cool neutral canvas, solid elevated surfaces, subtle borders, blue primary actions.
- Semantic colors live in `src/app/globals.css`; both themes must pass normal-text
  AA contrast. Never invert colors or hardcode light backgrounds in workspace UI.
- 240px desktop sidebar, responsive horizontal
  navigation on small screens. Keep primary actions and existing filters available.
- Shared cards use a 16px radius; controls use 12px. Prefer space and borders to
  extra decoration, gradients or glass effects. Use the existing Lucide icon family.
- Use real stored metrics. Product illustrations must be explicitly labeled as
  previews; do not fabricate growth rates, charts or delivery outcomes.
- Appearance supports Light, Dark and System, stored per browser. Apply the saved
  preference before paint, follow OS changes for System, and synchronize open tabs.
- Signed-in appearance controls live in Settings → Preferences, without header
  selectors. The marketing home page stays light and has no appearance control;
  visiting it must not overwrite the saved workspace theme.
- Landing-page motion uses short staggered entrances, one-time scroll reveals and
  smooth anchor navigation. Content stays accessible without JavaScript; reduced
  motion renders the final visible state without animation or transforms.
- Public seller pages keep their agent-specific light branding independently of
  the workspace setting, preserving the contrast of the agent's brand colors.
- Keep server components and existing authenticated data/action boundaries. Only
  appearance controls need new browser-side state; no schema change is needed.
- Verify desktop and mobile layouts, both themes, keyboard controls, persistence,
  reduced motion and readable status/error states before delivery.
