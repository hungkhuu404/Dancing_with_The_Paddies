# Project documentation

Start with the [project README](../README.md). It covers the problem, intended users, method, data sources, limits and how to run the project.

## Files in this folder

- [data-contract.md](data-contract.md): data contract 2.0.0. The files, keys and meaning of the exported data in `data/` that the web app reads.
- [pixel-dual-method.md](pixel-dual-method.md): the pixel method. How a 250 m block is marked as water from NISAR HH and HV pixels.
- [s6-comparison.md](s6-comparison.md): comparison with OPERA DSWx-S1 (stage S6). How to run the offline comparison and what it does and does not show.
- [pipeline-replay.md](pipeline-replay.md): how to re-run the pipeline for each site. Site configuration, local inputs, native 20 m pixel handling and the checks to run before publication.
- [images/flood-calendar-map-tan-hoi.jpg](images/flood-calendar-map-tan-hoi.jpg): screenshot of the Flood Calendar map of Tân Hội, used in the project README.

## Related documents outside this folder

- [Web app instructions](../web/README.md): running, testing and building the web app.
- [Asset and scene build tools](../web/tools/README.md): the offline tools that build the web app's scene assets.
