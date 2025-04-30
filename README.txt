INFO-637
Mark Heller
Final Project

Interactive web map for learning about New York City street trees. Built using HTML, CSS, JavaScript, and Leaflet.

Features:
- View New York City Street trees using NYC open data app token
- Extends attributes of street trees by referencing CSV hosted on GitHub
- Set visuals by extended attributes (color: genus, shape: category, radius: trunk diameter)
- Pop-up displaying tree data
- Search bar using NYC Planning Labs' Geosearch API
- Button to turn off base map
- Selectable legend, filter by genus
- Minimum scale for loading trees (only when all trees are visible, no filters on) - still buggy since we first load data then filter it
- About pop-up