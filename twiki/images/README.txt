CGV Web TWiki — images folder
=============================

Drop PNG / JPG / SVG screenshots here with the exact file names below.
All references from the .twiki topics are resolved relative to this
folder at local-preview time; when publishing to the CERN ATLAS TWiki,
attach each file to its corresponding topic (Foswiki rewrites the
<img src="images/..."/> paths to the attachment URL automatically).

Recommended canvas width: 1920 px for full-UI captures, cropped to a
sensible bounding box. Keep under ~500 kB per file (use tinypng or
`oxipng -strip all`).

Needed files
------------

1.  ui-overview.png            Full CGV Web interface, event loaded, all panels visible.
                              Used in: GettingStarted, UserInterface.

2.  loading-card.png          The loading overlay (CGV logo + progress bar).
                              Used in: GettingStarted.

3.  left-panel.png            Left panel detail: mode bar, event list, status bar,
                              request counter.
                              Used in: UserInterface.

4.  threshold-panel.png       Right-side energy threshold panel with at least one
                              tab selected (TILE or Cluster recommended).
                              Used in: UserInterface, EnergyThresholds.

5.  layers-panel.png          Detector Layers pop-up with TILE/LAr/HEC/FCAL switches
                              and All/None quick buttons.
                              Used in: UserInterface.

6.  ghost-panel.png           ATLAS Ghost panel with the nine envelope switches.
                              Used in: UserInterface.

7.  cell-tooltip.png          Hover tooltip over a cell, showing compact ID, η/φ,
                              energy.
                              Used in: UserInterface, EventData.

8.  screenshot-dialog.png     The resolution picker overlay (HD → 10K).
                              Used in: UserInterface.

9.  settings-panel.png        Settings panel with Preferences, Shortcuts,
                              Sponsors and About visible.
                              Used in: UserInterface.

10. mode-bar.png              Close-up of the Live / Local / Samples tri-button.
                              Used in: DataModes.

11. live-mode.png             Live mode with the green pulsing dot and events
                              streaming into the list. A browser grab of
                              atlas-live.cern.ch alongside can make a nice
                              side-by-side if you want.
                              Used in: DataModes.

12. local-mode.png            Local mode after folder selection, showing the
                              carousel bar and a non-empty event list.
                              Used in: DataModes.

13. samples-mode.png          Samples list (populated from default_xml/index.json).
                              Used in: DataModes.

14. calorimeter-overview.png  High-level diagram of the ATLAS calorimeter system
                              (Tile + LAr + HEC + FCAL). You can reuse the public
                              ATLAS "Calorimeter" diagram from atlas.cern, or take
                              a CGV Web capture with all four layers ON and the
                              beam-axis cones visible.
                              Used in: Geometry.

15. geometry-active-cells.png CGV Web capture with an event loaded, showing the
                              four active sub-detectors rendered as coloured cells
                              (no ghost envelopes).
                              Used in: Geometry.

16. ghost-envelopes.png       CGV Web capture with all nine ghost envelopes ON and
                              the dashed φ-segmentation overlay visible.
                              Used in: Geometry.

17. beam-axis.png             Capture with the beam-axis cones visible (press B in
                              CGV Web). Tight crop around the IP is nice.
                              Used in: Geometry.

18. coordinate-frame.png      A labelled diagram or CGV Web capture showing the
                              η / φ / z axes relative to the detector. A simple
                              over-drawn capture is fine.
                              Used in: EventData.


Optional / suggested extras (not referenced yet, but worth shipping)
--------------------------------------------------------------------

- atlas-live-landing.png      Screenshot of https://atlas-live.cern.ch to show
                              the upstream data source.
- atlantis-comparison.png     Side-by-side ATLANTIS vs CGV Web of the same event,
                              for the Overview page if you want to add one.
- cinema-mode.png             CGV Web in cinema mode (UI hidden, camera rotating).
                              Could be added to UserInterface.
- high-energy-event.png       A notable high-pT event capture for the project
                              splash / WebHome.

If you add any of the optional images, reference them from the topic with:

    <img src="images/<name>.png" alt="..." width="780" />

and, when publishing to CERN, attach the file to the matching topic.
