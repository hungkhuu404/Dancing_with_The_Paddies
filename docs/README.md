# Project documentation

Start with the [product README](../README.md): the problem, intended users, method, data sources, limits and how to run.

## Method and data

- [Data contract 2.0.0](data-contract.md): the files, keys and meaning of the exported data that the web app reads.
- [Pixel method](pixel-dual-method.md): how a 250 m block is marked as water from NISAR HH and HV pixels.
- [Comparison with OPERA DSWx-S1](s6-comparison.md): how to run the offline comparison and what it does and does not show.
- [Web app instructions](../web/README.md): running, testing and building the web app.

## Feature notes (`plans/`)

Design notes, checks and limits for each part of the web app:

- [Integrated map](plans/integrated-map.md), [calendar and method views](plans/calendar-method.md)
- [Two-site data integration](plans/two-site-real-data.md), [two-site frontend](plans/pixel-v2-two-sites.md)
- [Location entrance](plans/location-entrance.md), [observatory landing](plans/observatory-landing.md), [landing-map radar sweep](plans/atlas-sweep.md)
- [Landing-map marker echoes](plans/atlas-marker-echo.md): marker rings and label illumination synchronized with the sweep.
- [Guided-tour audio](plans/tour-audio.md), [tour refinement](plans/tour-refinement.md), [acquisition weather and Bang Rakam tour](plans/history-bang-tour.md)
- [Season playback, sound and guidance](plans/season-sound-guidance.md), [interface polish](plans/interface-polish.md)
- [Deployment](plans/dancing-production.md)

## Provenance (`provenance/`)

Where imported files and published data came from, with per-file hashes and the final data status. These files are historical records and are kept as written.
