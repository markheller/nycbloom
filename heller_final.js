// Create a variable to store your species data from CSV
let speciesData = {};

// Global variables
const genusColors = {};
let mapInstance;
let treeLayerInstance;
let baseMapLayer;
let selectedGenus = null;

// Load Species Glossary CSV
fetch('https://raw.githubusercontent.com/markheller/nycinbloom/refs/heads/main/species_clean.csv')
    .then(response => response.text())
    .then(csvText => {
        // Parse CSV text
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');

        // Create lookup object from CSV
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length > 1) {
                const speciesName = values[headers.indexOf('spc_common')].trim();

                // Store all properties for this species
                speciesData[speciesName] = {};
                headers.forEach((header, index) => {
                    speciesData[speciesName][header] = values[index];
                });
            }
        }

        console.log("Species data loaded:", speciesData);

        // Now initialize the map and load trees
        initMap();
    })
    .catch(error => {
        console.error("Error loading species CSV:", error);
        // If CSV fails, still initialize the map with default styling
        initMap();
    });


// Constants
const x_higgins = 40.68827460071745;
const y_higgins = -73.96451574866336;

const x_pmc = 40.73838903444027;
const y_pmc = -73.99887769893675;

const x_eightoaks = 40.70755092286839;
const y_eightoaks = -73.8268719835956;

const map_scale = 18;

// Function to get color based on genus from CSV
function getGenusColor(genus) {
    if (!genus) genus = "Unknown";

    if (!genusColors[genus]) {
        const hue = Math.floor(Math.random() * 360);
        genusColors[genus] = `hsl(${hue}, 70%, 50%)`;

        // Update the legend with the new genus (if the function exists)
        if (window.updateGenusLegend) {
            window.updateGenusLegend();
        }
    }
    return genusColors[genus];
}

// Function to fetch trees in the current view
function loadTreesInView() {
    const map = window.mapInstance;
    const treeLayer = window.treeLayerInstance;

    if (!map || !treeLayer) return;

    // Clear existing trees
    treeLayer.clearLayers();

    // Get current zoom level
    const currentZoom = map.getZoom();
    const minimumZoomForTrees = 17;

    // Only apply zoom restriction if no genus is selected
    if (!selectedGenus && currentZoom < minimumZoomForTrees) {
        // Show zoom notice if we're zoomed out too far and no genus is selected
        if (!window.zoomNoticeAdded) {
            const zoomNotice = L.control({ position: 'bottomleft' });
            zoomNotice.onAdd = function () {
                const div = L.DomUtil.create('div', 'zoom-notice');
                div.innerHTML = `<div class="zoom-message">Zoom in to see all trees</div>`;
                return div;
            };
            zoomNotice.addTo(map);
            window.zoomNoticeAdded = zoomNotice;
        }
        return;
    } else if (window.zoomNoticeAdded) {
        // Remove the zoom notice when either zoomed in enough or a genus is selected
        map.removeControl(window.zoomNoticeAdded);
        window.zoomNoticeAdded = null;
    }

    // Get current map bounds
    var bounds = map.getBounds();
    var north = bounds.getNorth();
    var south = bounds.getSouth();
    var east = bounds.getEast();
    var west = bounds.getWest();

    // Use a dynamic limit based on zoom level and whether a genus is selected
    // When zoomed out far with a genus selected, we need more data points to ensure we get enough of that genus
    let limit;
    if (selectedGenus) {
        // If genus selected, use higher limits based on zoom level
        // At low zoom levels we need more total trees to ensure we get enough of the selected genus
        if (currentZoom < 12) limit = 3000;
        else if (currentZoom < 14) limit = 2500;
        else limit = 2000;
    } else {
        // When showing all genera, use more conservative limits
        if (currentZoom < minimumZoomForTrees) limit = 1000;
        else limit = 2000;
    }

    // Create query based on current map view
    var query = `https://data.cityofnewyork.us/resource/uvpi-gqnh.json?$limit=${limit}&$where=latitude between ${south} and ${north} and longitude between ${west} and ${east}`;

    // Set up a loading indicator
    map.getContainer().classList.add('loading');

    // Count how many trees we add to the map after filtering
    let addedTreesCount = 0;
    // Maximum number of markers to add to prevent performance issues
    const maxMarkersToAdd = 2000;

    fetch(query, {
        headers: {
            'X-App-Token': 'Ed7xyhYUIg55IjApCuPIkBe9T'
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log(`Found ${data.length} trees in current view`);

            // Process trees but limit the number actually added to the map
            for (let i = 0; i < data.length && addedTreesCount < maxMarkersToAdd; i++) {
                const tree = data[i];

                if (tree.latitude && tree.longitude) {
                    const lat = parseFloat(tree.latitude);
                    const lng = parseFloat(tree.longitude);
                    const species = tree.spc_common || "Unknown";
                    const species_latin = tree.spc_latin;
                    const species_formatted = toTitleCase(species);
                    const address = tree.address + ", " + tree.nta_name + ", " + tree.boroname;
                    const address_formatted = toTitleCase(address);

                    // Get additional data from our CSV if available
                    const speciesInfo = speciesData[species] || {};
                    const treeGenus = speciesInfo.genus_latin || "Unknown";

                    // Skip this tree if a genus is selected and it doesn't match
                    if (selectedGenus && treeGenus !== selectedGenus) {
                        continue;
                    }

                    // Increment our counter for displayed trees
                    addedTreesCount++;

                    // Decide on marker style based on CSV data if available
                    let fillColor;
                    if (speciesInfo.group) {
                        // Use genus from CSV for coloring
                        fillColor = getGenusColor(treeGenus);
                    } else {
                        // Fall back to random species color
                        fillColor = "gray";
                    }

                    // Get tree diameter and determine radius
                    const treeDiameter = parseFloat(tree.tree_dbh) || 0;

                    // Use stepped sizing for all tree types
                    let rad = 3; // Default size for small trees
                    if (tree.tree_dbh > 6 && tree.tree_dbh < 12) {
                        rad = 5;
                    }
                    else if (tree.tree_dbh > 12 && tree.tree_dbh < 18) {
                        rad = 8;
                    }
                    else if (tree.tree_dbh > 18 && tree.tree_dbh < 24) {
                        rad = 11;
                    }
                    else if (tree.tree_dbh > 24 && tree.tree_dbh < 120) {
                        rad = 14;
                    }
                    else if (tree.tree_dbh > 120) {
                        rad = 17;
                    }

                    // Get the group value
                    const group = speciesInfo.group ? speciesInfo.group.toLowerCase() : "";
                    let marker;
                    const genusColor = speciesInfo.genus_latin ? getGenusColor(speciesInfo.genus_latin) : "gray";

                    if (group === "conifer") {
                        // Create a square marker for conifers with stepped sizing
                        // Use a fixed ratio to convert radius to square size
                        const squareSize = rad / 75000; // Adjusted ratio for squares
                        const bounds = [
                            [lat - squareSize, lng - squareSize], // southwest corner
                            [lat + squareSize, lng + squareSize]  // northeast corner
                        ];
                        marker = L.rectangle(bounds, {
                            color: "white",
                            weight: 1,
                            fillColor: fillColor,
                            fillOpacity: 0.7,
                            opacity: 0.7
                        });
                    }
                    else if (group === "ginkgo") {
                        // Create a triangle marker for ginkgo with stepped sizing
                        // Use a fixed ratio to convert radius to triangle size
                        const triangleSize = rad / 275000; // Adjusted ratio for triangles
                        const points = [
                            [lat + triangleSize, lng],             // top point
                            [lat - triangleSize, lng - triangleSize], // bottom left
                            [lat - triangleSize, lng + triangleSize]  // bottom right
                        ];
                        marker = L.polygon(points, {
                            color: "white",
                            weight: 1,
                            fillColor: fillColor,
                            fillOpacity: 0.7,
                            opacity: 0.7
                        });
                    }
                    else {
                        // Default to circle for broadleaf (unchanged)
                        marker = L.circleMarker([lat, lng], {
                            radius: rad,
                            color: "white",
                            fillColor: fillColor,
                            weight: 1,
                            fillOpacity: 0.7,
                            opacity: 0.7
                        });
                    }

                    marker.addTo(treeLayer)
                        .bindPopup(`
                            <strong>${species_formatted}</strong><br>
                            <em>${tree.spc_latin}</em><br>
                            <br>
                            ${speciesInfo.genus_common ? `Genus: ${speciesInfo.genus_common}<br>` : ''}
                            ${speciesInfo.group ? `Group: ${speciesInfo.group}<br>` : ''}
                            Trunk Diameter: ${tree.tree_dbh || "?"}"<br>
                            Address: ${address_formatted || "No address"}
                        `);
                }
            }

            // If we had to limit the number of markers, show a notice
            if (addedTreesCount >= maxMarkersToAdd && data.length > maxMarkersToAdd) {
                if (!window.limitNoticeAdded) {
                    const limitNotice = L.control({ position: 'bottomleft' });
                    limitNotice.onAdd = function () {
                        const div = L.DomUtil.create('div', 'limit-notice');
                        div.innerHTML = `<div class="limit-message">Showing ${addedTreesCount} of ${data.length} trees</div>`;
                        return div;
                    };
                    limitNotice.addTo(map);
                    window.limitNoticeAdded = limitNotice;

                    // Remove notice after 5 seconds
                    setTimeout(() => {
                        if (window.limitNoticeAdded) {
                            map.removeControl(window.limitNoticeAdded);
                            window.limitNoticeAdded = null;
                        }
                    }, 5000);
                }
            }

            // Remove loading indicator
            map.getContainer().classList.remove('loading');
        })
        .catch(error => {
            console.error("Error fetching tree data:", error);
            map.getContainer().classList.remove('loading');
        });
}

// Function to add NYC geocoder
function addNYCGeocoder(map) {
    // Create custom search control container
    const searchControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-control-nyc-search');
            const input = L.DomUtil.create('input', 'nyc-search-input', container);
            const resultsContainer = L.DomUtil.create('div', 'nyc-search-results', container);

            input.type = 'text';
            input.placeholder = 'Search NYC address...';
            input.autocomplete = 'off';

            // Prevent map interactions while typing
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            // Handle input events
            input.addEventListener('input', debounce(function (e) {
                const query = e.target.value;
                if (query.length < 3) {
                    resultsContainer.innerHTML = '';
                    return;
                }

                searchNYC(query, resultsContainer, map);
            }, 300));

            return container;
        }
    });

    // Add the search control to the map
    map.addControl(new searchControl());
}

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Function to search NYC Geosearch API with expanded parameters
function searchNYC(query, resultsContainer, map) {
    // Using NYC Planning Labs' Geosearch API with expanded parameters
    fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}&size=10&boundary.borough=true`)
        .then(response => response.json())
        .then(data => {
            resultsContainer.innerHTML = '';

            if (!data.features || data.features.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'nyc-search-result';
                noResults.textContent = 'No results found';
                resultsContainer.appendChild(noResults);
                return;
            }

            data.features.slice(0, 5).forEach(feature => {
                const resultItem = document.createElement('div');
                resultItem.className = 'nyc-search-result';
                resultItem.textContent = feature.properties.label;

                resultItem.addEventListener('click', function () {
                    // Get the search input element
                    const searchInput = document.querySelector('.nyc-search-input');
                    
                    // Update the input value with the selected result
                    searchInput.value = feature.properties.label;
                    
                    // Clear results
                    resultsContainer.innerHTML = '';

                    // Get coordinates
                    const [lng, lat] = feature.geometry.coordinates;

                    // Zoom to location
                    map.setView([lat, lng], 18);

                    // Load trees for the new area
                    loadTreesInView();
                });

                resultsContainer.appendChild(resultItem);
            });
        })
        .catch(error => {
            console.error('Error searching NYC locations:', error);
            resultsContainer.innerHTML = '<div class="nyc-search-result">Error searching locations</div>';
        });
}

// Function to add NYC geocoder
function addNYCGeocoder(map) {
    // Create custom search control container
    const searchControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-control-nyc-search');
            const input = L.DomUtil.create('input', 'nyc-search-input', container);
            const resultsContainer = L.DomUtil.create('div', 'nyc-search-results', container);

            input.type = 'text';
            input.placeholder = 'Search NYC address or place...';
            input.autocomplete = 'off';

            // Prevent map interactions while typing
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            // Handle input events
            input.addEventListener('input', debounce(function (e) {
                const query = e.target.value;
                if (query.length < 3) {
                    resultsContainer.innerHTML = '';
                    return;
                }

                searchNYC(query, resultsContainer, map);
            }, 300));

            // Add clear button functionality
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    input.value = '';
                    resultsContainer.innerHTML = '';
                }
            });

            return container;
        }
    });

    // Add the search control to the map
    map.addControl(new searchControl());
}

// Legend
function createGenusLegend(map) {
    // Create a control for the legend
    var legend = L.control({ position: 'bottomright' });

    legend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = '<h4>Tree Genera</h4><div id="genus-legend-content"></div>';
        return div;
    };

    legend.addTo(map);

    // Update the legend with new genus colors and make them selectable
    window.updateGenusLegend = function () {
        var legendContent = document.getElementById('genus-legend-content');
        if (!legendContent) return;

        // Clear existing content
        legendContent.innerHTML = '';

        // Sort genera alphabetically
        var sortedGenera = Object.keys(genusColors).sort();

        // Create a mapping of genus to group and genus to common name
        const genusToGroup = {};
        const genusToCommon = {};

        // Determine the group and common name for each genus by looking at the species data
        Object.keys(speciesData).forEach(species => {
            const info = speciesData[species];
            if (info.genus_latin && !genusToGroup[info.genus_latin]) {
                genusToGroup[info.genus_latin] = (info.group || "").toLowerCase();
                genusToCommon[info.genus_latin] = info.genus_common || "";
            }
        });

        // Add each genus to the legend
        sortedGenera.forEach(function (genus) {
            if (genus !== "Unknown") {
                var item = document.createElement('div');
                item.className = 'legend-item';
                // Add selected class if this genus is currently selected
                if (selectedGenus === genus) {
                    item.className += ' selected';
                }

                // Get the group for this genus
                const group = genusToGroup[genus] || "broadleaf";

                // Create the appropriate symbol based on group
                let symbolHTML = '';
                if (group === "conifer") {
                    // Square for conifers
                    symbolHTML = `<span class="legend-symbol square" style="background:${genusColors[genus]}"></span>`;
                } else if (group === "ginkgo") {
                    // Triangle for ginkgo
                    symbolHTML = `<span class="legend-symbol triangle" style="background:${genusColors[genus]}"></span>`;
                } else {
                    // Circle for broadleaf (default)
                    symbolHTML = `<span class="legend-symbol circle" style="background:${genusColors[genus]}"></span>`;
                }

                // Get the common name for this genus
                const commonName = genusToCommon[genus] || "";
                const displayName = commonName ? `${genus} (${commonName})` : genus;

                item.innerHTML = `${symbolHTML} ${displayName}`;

                // Add click event listener
                item.addEventListener('click', function () {
                    if (selectedGenus === genus) {
                        // If already selected, deselect it
                        selectedGenus = null;
                        item.classList.remove('selected');
                    } else {
                        // Deselect previous selection if any
                        if (selectedGenus) {
                            const prevSelected = document.querySelector('.legend-item.selected');
                            if (prevSelected) prevSelected.classList.remove('selected');
                        }
                        // Select this genus
                        selectedGenus = genus;
                        item.classList.add('selected');
                    }

                    // Reload trees with filter
                    loadTreesInView();
                });

                legendContent.appendChild(item);
            }
        });

        // Add "Unknown" at the end if it exists
        if (genusColors["Unknown"]) {
            var item = document.createElement('div');
            item.className = 'legend-item';
            if (selectedGenus === "Unknown") {
                item.className += ' selected';
            }
            // Use circle for unknown
            item.innerHTML = `<span class="legend-symbol circle" style="background:${genusColors["Unknown"]}"></span> Unknown`;

            item.addEventListener('click', function () {
                if (selectedGenus === "Unknown") {
                    selectedGenus = null;
                    item.classList.remove('selected');
                } else {
                    const prevSelected = document.querySelector('.legend-item.selected');
                    if (prevSelected) prevSelected.classList.remove('selected');
                    selectedGenus = "Unknown";
                    item.classList.add('selected');
                }
                loadTreesInView();
            });

            legendContent.appendChild(item);
        }
    };

    return legend;
}

// Function to add the About button above the legend
function addAboutButton(map) {
    // Create a control for the About button
    const aboutControl = L.Control.extend({
        options: {
            position: 'bottomright'
        },

        onAdd: function () {
            // Create button container
            const container = L.DomUtil.create('div', 'leaflet-control');

            // Create button element
            const button = L.DomUtil.create('button', 'about-button', container);
            button.textContent = 'About';

            // Add click event listener to show modal
            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                L.DomEvent.stopPropagation(e);

                // Show the modal
                document.getElementById('about-modal').style.display = 'flex';
            });

            // Prevent map interactions
            L.DomEvent.disableClickPropagation(container);

            return container;
        }
    });

    // Add the About button to the map
    map.addControl(new aboutControl());

    // Create the modal structure
    createAboutModal();
}

// Function to create the About modal
function createAboutModal() {
    // Check if the modal already exists
    if (document.getElementById('about-modal')) return;

    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'about-modal';
    modal.className = 'about-modal';

    // Create modal content
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <h2 class="modal-title">Street Trees of New York</h2>
            <div class="modal-body">
                <h3>About</h3>
                <p>Interactive web map for learning about New York City street trees. Built using HTML, CSS, JavaScript, and Leaflet. 
                Reads street tree data from NYC Open Data and extends attributes by referencing species data.</p>
                </br>
                
                <h3>How to Use</h3>
            
                                <ul>
                    <li>Click on tree markers to see details</li>
                    <li>Select a genus from the legend to filter</li>
                    <li>Use the search box to find specific locations</li>
                    <li>Toggle the base map on/off with the map button</li>
                
                                </ul>
                </br>

                <h3>Classification</h3>
                <p>Trees are classified into three major groups:</p>
                <ul>
                    <li><strong>Broadleaf:</strong> Circles</li>
                    <li><strong>Conifer:</strong> Squares</li>
                    <li><strong>Ginkgo:</strong> Triangles</li>
                </ul>
                </br>
                
                <h3>Created By</h3>
                <p>Mark Heller</br>
                School of Architecture</br>
                Pratt Institute </p>
            </div>
        </div>
    `;

    // Add to document body
    document.body.appendChild(modal);

    // Add close functionality
    document.querySelector('.close-modal').addEventListener('click', function () {
        document.getElementById('about-modal').style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', function (event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Close modal with Escape key
    window.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });
}

// Function to initialize map
function initMap() {
    // Create map
    mapInstance = L.map('map').setView([x_higgins, y_higgins], map_scale);
    window.mapInstance = mapInstance;

    /*
    // Stamen Terrain Tile Layer
    L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png?api_key=ca55dee9-ff59-41b0-98ef-65fbb7e81cf5', {
        minZoom: 11,
        maxZoom: 21,
        attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://stamen.com/" target="_blank">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    }).addTo(map);
    */

    //  Alidade Smooth Dark 
    baseMapLayer = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=ca55dee9-ff59-41b0-98ef-65fbb7e81cf5', {
        minZoom: 11,
        maxZoom: 21,
        attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    }).addTo(mapInstance);

    // Create Legend
    createGenusLegend(mapInstance);

    // Add about button and modal
    addAboutButton(mapInstance);

    // Add NYC geocoder
    addNYCGeocoder(mapInstance);

    // Add base map toggle button
    addBaseMapToggle(mapInstance);

    // Create tree layer
    treeLayerInstance = L.layerGroup().addTo(mapInstance);
    window.treeLayerInstance = treeLayerInstance;

    // Load trees on initial view
    loadTreesInView();

    // Update trees when the map is moved
    mapInstance.on('moveend', loadTreesInView);

    // Add a loading indicator
    mapInstance.on('movestart', function () {
        document.getElementById('map').style.cursor = 'progress';
    });

    mapInstance.on('moveend', function () {
        document.getElementById('map').style.cursor = '';
    });
}

// Function to add a base map toggle button
function addBaseMapToggle(map) {
    // Create a custom control for the toggle button
    const baseMapToggle = L.Control.extend({
        options: {
            position: 'topright'
        },

        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
            const button = L.DomUtil.create('a', 'base-map-toggle', container);

            // Get the map container element
            const mapContainer = map.getContainer();

            button.href = '#';
            button.title = 'Toggle Base Map';
            // button.innerHTML = '<span>Base Map</span>';

            // Initial state - base map is visible
            button.setAttribute('data-state', 'on');

            // Handle toggle click
            L.DomEvent.on(button, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                L.DomEvent.stopPropagation(e);

                const currentState = button.getAttribute('data-state');

                if (currentState === 'on') {
                    // Turn off base map
                    map.removeLayer(baseMapLayer);
                    button.setAttribute('data-state', 'off');
                    button.classList.add('base-map-off');

                    // Add background color class to map
                    mapContainer.classList.add('base-map-off-bg');
                } else {
                    // Turn on base map
                    baseMapLayer.addTo(map);
                    button.setAttribute('data-state', 'on');
                    button.classList.remove('base-map-off');

                    // Remove background color class from map
                    mapContainer.classList.remove('base-map-off-bg');
                }
            });

            // Prevent default behavior
            L.DomEvent.disableClickPropagation(container);

            return container;
        }
    });

    // Add the control to the map
    map.addControl(new baseMapToggle());
}

// Case Functions
function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}

// Random species colors 
const speciesColors = {};