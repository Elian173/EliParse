// === Boomi Profile Utilities App Logic ===

// --- Global Variables (Specific to this app) ---
window.boomiXmlDoc = null; // Holds the parsed XML document of the *input* profile
window.profileType = null; // 'EDI' or 'XML' or null
window.currentOutputType = null; // 'XSD' or 'ProfileXML' or null - Tracks what's in the output area

// --- Initialization Function (Called by main.js) ---
function initBoomiUtilsApp() {
    console.log("Initializing Boomi Profile Utilities App...");

    // --- DOM Element References (Scoped to this app) ---
    // It's generally better to query within the app's container if possible,
    // but using IDs is okay since they should be unique page-wide.
    const fileInputElement = document.getElementById('fileInput');
    const xmlInputAreaElement = document.getElementById('xmlInputArea');
    const previewAreaElement = document.getElementById('previewArea');
    const statusMessageElement = document.getElementById('statusMessage');
    const generateXsdButton = document.getElementById('generateXsd');
    const removeLengthValidationButton = document.getElementById('removeLengthValidation');
    const renameOnlyButton = document.getElementById('renameOnly');
    const generateTagsButton = document.getElementById('generateTags');
    const generateTagsAndRenameButton = document.getElementById('generateTagsAndRename');
    const generatedOutputContainer = document.getElementById('generatedOutputContainer');
    const generatedContentElement = document.getElementById('generatedContent');
    const copyButton = document.getElementById('copyButton');
    const copyStatusElement = document.getElementById('copyStatus');
    const downloadButton = document.getElementById('downloadButton');
    const fileNameDisplay = document.getElementById('fileName');

    // --- Event Listeners (Specific to this app) ---
    // Clear previous listeners if any (optional, good practice for complex SPAs)
    // For this simple case, we might skip this, but showing the pattern:
    // Example: fileInputElement.replaceWith(fileInputElement.cloneNode(true));
    //          fileInputElement = document.getElementById('fileInput'); // Re-select after clone

    if (fileInputElement) fileInputElement.addEventListener('change', handleFileInputChange);
    if (xmlInputAreaElement) xmlInputAreaElement.addEventListener('input', handleTextInputChange);
    if (generateXsdButton) generateXsdButton.addEventListener('click', handleGenerateXsd);
    if (removeLengthValidationButton) removeLengthValidationButton.addEventListener('click', handleRemoveLengthValidation);
    if (renameOnlyButton) renameOnlyButton.addEventListener('click', handleRenameOnly);
    if (generateTagsButton) generateTagsButton.addEventListener('click', handleGenerateTags);
    if (generateTagsAndRenameButton) generateTagsAndRenameButton.addEventListener('click', handleGenerateTagsAndRename);
    if (copyButton) copyButton.addEventListener('click', handleCopy);
    if (downloadButton) downloadButton.addEventListener('click', handleDownload);

    // Listener for file input to show the chosen file name
    if (fileInputElement && fileNameDisplay) {
        fileInputElement.addEventListener('change', function() {
            fileNameDisplay.textContent = (this.files && this.files.length > 0) ? this.files[0].name : 'No file chosen';
        });
        // Initialize file name display in case a file is already selected (e.g., browser cache)
        fileNameDisplay.textContent = (fileInputElement.files && fileInputElement.files.length > 0) ? fileInputElement.files[0].name : 'No file chosen';
    }

    // Reset state when initializing (optional, depends on desired behavior)
    // resetState(); // You might want to clear things when the app loads

    console.log("Boomi Profile Utilities App Initialized.");


    // --- Input Handling Functions ---
    function handleFileInputChange(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (statusMessageElement) statusMessageElement.textContent = `Reading file: ${file.name}...`;
        if (previewAreaElement) {
            previewAreaElement.textContent = '';
            previewAreaElement.classList.remove('error');
        }
        if (generatedOutputContainer) generatedOutputContainer.style.display = 'none';
        window.currentOutputType = null;
        const reader = new FileReader();
        reader.onload = function (e) {
            const xmlString = e.target.result;
            if (xmlInputAreaElement) xmlInputAreaElement.value = xmlString;
            processXmlString(xmlString);
        };
        reader.onerror = function(e) {
            console.error("Error reading file:", e);
            if (statusMessageElement) statusMessageElement.textContent = '';
            if (previewAreaElement) {
                previewAreaElement.textContent = 'Error reading the selected file.';
                previewAreaElement.classList.add('error');
            }
            resetState();
        };
        reader.readAsText(file);
    }

    let inputTimeout;
    function handleTextInputChange(event) {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
            if (statusMessageElement) statusMessageElement.textContent = `Processing pasted text...`;
            if (previewAreaElement) {
                previewAreaElement.textContent = '';
                previewAreaElement.classList.remove('error');
            }
            if (generatedOutputContainer) generatedOutputContainer.style.display = 'none';
            window.currentOutputType = null;
            if (fileInputElement) fileInputElement.value = '';
            if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
            const xmlString = event.target.value;
            processXmlString(xmlString);
        }, 500);
    }

    function processXmlString(xmlString) {
        if (!xmlString || xmlString.trim() === '') {
            if (previewAreaElement) previewAreaElement.textContent = 'Load or paste a Boomi EDI or XML Profile XML file...';
            if (statusMessageElement) statusMessageElement.textContent = '';
            resetState();
            return;
        }
        if (removeLengthValidationButton) removeLengthValidationButton.disabled = true;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        const parserError = xmlDoc.querySelector('parsererror');

        if (parserError) {
            console.error("Error parsing XML:", parserError.textContent);
            if (previewAreaElement) {
                previewAreaElement.textContent = `Error parsing XML:\n${parserError.textContent}`;
                previewAreaElement.classList.add('error');
            }
            if (statusMessageElement) statusMessageElement.textContent = 'XML Parsing Error.';
            resetState();
            return;
        }

        const ediProfileElement = xmlDoc.querySelector('EdiProfile');
        const xmlProfileElement = xmlDoc.querySelector('XMLProfile');
        let profileName = xmlDoc.documentElement.getAttribute('name') || '[Unknown Profile Name]';

        if (ediProfileElement) {
            setProfileState('EDI', xmlDoc, profileName);
            try {
                // Check if profileProcessors.js functions are available
                if (typeof parseBoomiEdiXmlForPreview === 'function') {
                   if (previewAreaElement) previewAreaElement.textContent = parseBoomiEdiXmlForPreview(xmlDoc);
                } else {
                   console.error("parseBoomiEdiXmlForPreview function not found!");
                   if (previewAreaElement) previewAreaElement.textContent = "Error: Preview function missing.";
                }
            } catch (err) {
                handlePreviewError(err, 'EDI');
            }
        } else if (xmlProfileElement) {
            setProfileState('XML', xmlDoc, profileName);
            try {
                 if (typeof parseBoomiXmlProfileForPreview === 'function') {
                    if (previewAreaElement) previewAreaElement.textContent = parseBoomiXmlProfileForPreview(xmlDoc);
                 } else {
                    console.error("parseBoomiXmlProfileForPreview function not found!");
                    if (previewAreaElement) previewAreaElement.textContent = "Error: Preview function missing.";
                 }
            } catch (err) {
                handlePreviewError(err, 'XML');
            }
        } else {
            const rootElementName = xmlDoc.documentElement ? xmlDoc.documentElement.tagName : 'N/A';
            if (previewAreaElement) {
                previewAreaElement.textContent = `Error: Could not find <EdiProfile> or <XMLProfile> element (Root: <${rootElementName}>). Is this a Boomi Profile Component XML?`;
                previewAreaElement.classList.add('error');
            }
            if (statusMessageElement) statusMessageElement.textContent = 'Unrecognized Profile Type.';
            resetState();
        }
    }

    // --- State Management ---
    function setProfileState(type, xmlDoc, name) {
        window.profileType = type;
        window.boomiXmlDoc = xmlDoc.cloneNode(true);

        if (generateXsdButton) generateXsdButton.disabled = (type !== 'EDI');
        if (renameOnlyButton) renameOnlyButton.disabled = (type !== 'XML');
        if (generateTagsButton) generateTagsButton.disabled = (type !== 'XML');
        if (generateTagsAndRenameButton) generateTagsAndRenameButton.disabled = (type !== 'XML');

        if (statusMessageElement) statusMessageElement.textContent = `${type} Profile Loaded: ${name}`;
        if (previewAreaElement) previewAreaElement.classList.remove('error');
        if (generatedOutputContainer) generatedOutputContainer.style.display = 'none';
        window.currentOutputType = null;
        if (copyStatusElement) copyStatusElement.textContent = '';
        if (removeLengthValidationButton) removeLengthValidationButton.disabled = true;
    }

    function resetState() {
        window.profileType = null;
        window.boomiXmlDoc = null;
        window.currentOutputType = null;
        if (generateXsdButton) generateXsdButton.disabled = true;
        if (removeLengthValidationButton) removeLengthValidationButton.disabled = true;
        if (renameOnlyButton) renameOnlyButton.disabled = true;
        if (generateTagsButton) generateTagsButton.disabled = true;
        if (generateTagsAndRenameButton) generateTagsAndRenameButton.disabled = true;
        if (generatedOutputContainer) generatedOutputContainer.style.display = 'none';
        // Optionally clear inputs/previews
        // if (xmlInputAreaElement) xmlInputAreaElement.value = '';
        // if (previewAreaElement) previewAreaElement.textContent = 'Load or paste...';
        // if (statusMessageElement) statusMessageElement.textContent = '';
        // if (fileInputElement) fileInputElement.value = '';
        // if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
    }

    function handlePreviewError(error, type) {
        console.error(`Error generating ${type} preview:`, error);
        if (previewAreaElement) {
            previewAreaElement.textContent = `Preview generation error for ${type} profile: ${error.message}`;
            previewAreaElement.classList.add('error');
        }
        if (statusMessageElement) statusMessageElement.textContent = 'Error generating preview.';
    }

    // --- Action Handlers ---
    function handleGenerateXsd() {
        if (!window.boomiXmlDoc || window.profileType !== 'EDI') {
            alert('Please load an EDI Profile first.');
            return;
        }
        try {
            if (statusMessageElement) statusMessageElement.textContent = 'Generating XSD (Validation Included)...';
            // Check if processor function exists
            if (typeof generateXsd !== 'function') {
                 throw new Error("generateXsd function is not available.");
            }
            const xsdString = generateXsd(window.boomiXmlDoc.cloneNode(true));
            displayGeneratedOutput(xsdString, 'Generated XSD', 'XSD', 'xsdFromEdiToImport.xsd');
            if (statusMessageElement) statusMessageElement.textContent = 'XSD Generation Complete.';
        } catch (error) {
            handleActionError(error, 'XSD generation');
        }
    }

    function handleRemoveLengthValidation() {
        if (!generatedContentElement || !window.currentOutputType || window.currentOutputType !== 'XSD') {
            alert('No XSD found in the output area to modify.');
            return;
        }
        const currentXsd = generatedContentElement.textContent;
        if (!currentXsd) {
            alert('XSD output area is empty.');
            return;
        }
        try {
            if (statusMessageElement) statusMessageElement.textContent = 'Removing Length Validation from XSD...';
             // Check if processor function exists
            if (typeof removeLengthRestrictionsFromXsd !== 'function') {
                 throw new Error("removeLengthRestrictionsFromXsd function is not available.");
            }
            const modifiedXsdString = removeLengthRestrictionsFromXsd(currentXsd);
            if (modifiedXsdString) {
                displayGeneratedOutput(modifiedXsdString, 'Generated XSD (Length Validation Removed)', 'XSD', 'xsd_no_length_validation.xsd');
                if (statusMessageElement) statusMessageElement.textContent = 'Length Validation Removal Complete.';
            } else {
                throw new Error("Length restriction removal returned empty result.");
            }
        } catch (error) {
            handleActionError(error, 'Length Validation Removal');
        }
    }

    function handleRenameOnly() {
        if (!window.boomiXmlDoc || window.profileType !== 'XML') {
            alert('Please load an XML Profile first.');
            return;
        }
        try {
            if (statusMessageElement) statusMessageElement.textContent = 'Renaming Elements...';
             // Check if processor function exists
            if (typeof renameElementsOnly !== 'function') {
                 throw new Error("renameElementsOnly function is not available.");
            }
            const modifiedXmlString = renameElementsOnly(window.boomiXmlDoc.cloneNode(true));
            if (modifiedXmlString) {
                displayGeneratedOutput(modifiedXmlString, 'Renamed Profile XML (Descriptive Names)', 'ProfileXML', 'profile_renamed.xml');
                if (statusMessageElement) statusMessageElement.textContent = 'Element Renaming Complete.';
            } else {
                throw new Error("Renaming function returned empty result.");
            }
        } catch (error) {
            handleActionError(error, 'Element Renaming');
        }
    }

    function handleGenerateTags() {
        if (!window.boomiXmlDoc || window.profileType !== 'XML') {
            alert('Please load an XML Profile first.');
            return;
        }
        try {
            if (statusMessageElement) statusMessageElement.textContent = 'Generating/Updating TagLists...';
             // Check if processor function exists
            if (typeof generateTagListsForXmlProfile !== 'function') {
                 throw new Error("generateTagListsForXmlProfile function is not available.");
            }
            const modifiedXmlString = generateTagListsForXmlProfile(window.boomiXmlDoc.cloneNode(true));
            if (modifiedXmlString) {
                displayGeneratedOutput(modifiedXmlString, 'Profile XML with TagLists', 'ProfileXML', 'profile_with_tags.xml');
                if (statusMessageElement) statusMessageElement.textContent = 'TagList Generation/Update Complete.';
            } else {
                throw new Error("TagList generation returned empty result.");
            }
        } catch (error) {
            handleActionError(error, 'TagList generation');
        }
    }

    function handleGenerateTagsAndRename() {
        if (!window.boomiXmlDoc || window.profileType !== 'XML') {
            alert('Please load an XML Profile first.');
            return;
        }
        try {
            if (statusMessageElement) statusMessageElement.textContent = 'Renaming Elements & Generating Tags...';
             // Check if processor function exists
            if (typeof generateTagListsAndRenameElements !== 'function') {
                 throw new Error("generateTagListsAndRenameElements function is not available.");
            }
            const modifiedXmlString = generateTagListsAndRenameElements(window.boomiXmlDoc.cloneNode(true));
            if (modifiedXmlString) {
                displayGeneratedOutput(modifiedXmlString, 'Renamed Profile XML with TagLists', 'ProfileXML', 'profile_renamed_with_tags.xml');
                if (statusMessageElement) statusMessageElement.textContent = 'Element Renaming & TagList Generation Complete.';
            } else {
                throw new Error("Renaming/TagList generation returned empty result.");
            }
        } catch (error) {
            handleActionError(error, 'Element Renaming & TagList generation');
        }
    }

    function handleActionError(error, actionName) {
        console.error(`Error during ${actionName}:`, error);
        if (previewAreaElement) {
            previewAreaElement.textContent += `\n\nError during ${actionName}: ${error.message}`;
            previewAreaElement.classList.add('error');
        }
        if (statusMessageElement) statusMessageElement.textContent = `Error during ${actionName}.`;
        if (generatedOutputContainer) generatedOutputContainer.style.display = 'none';
        window.currentOutputType = null;
        if (removeLengthValidationButton) removeLengthValidationButton.disabled = true;
    }

    // --- Output Handling ---
    function displayGeneratedOutput(content, title, outputType, suggestedFilename) {
        if (generatedContentElement) generatedContentElement.textContent = content;
        if (generatedOutputContainer) {
            generatedOutputContainer.querySelector('h2').textContent = title + ':';
            generatedOutputContainer.style.display = 'block';
        }
        window.currentOutputType = outputType;
        if (copyStatusElement) copyStatusElement.textContent = '';
        if (copyButton) {
            copyButton.textContent = 'Copy to Clipboard';
            copyButton.disabled = false;
        }

        if (removeLengthValidationButton) removeLengthValidationButton.disabled = (outputType !== 'XSD');

        if (downloadButton) {
            if (outputType === 'XSD' || outputType === 'ProfileXML') {
                downloadButton.style.display = 'inline-block';
                downloadButton.dataset.filename = suggestedFilename;
            } else {
                downloadButton.style.display = 'none';
                delete downloadButton.dataset.filename;
            }
        }

        if (generatedOutputContainer) generatedOutputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function handleCopy() {
        const textToCopy = generatedContentElement?.textContent;
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            if (copyStatusElement) copyStatusElement.textContent = 'Copied!';
            if (copyButton) {
                copyButton.textContent = 'Copied!';
                copyButton.disabled = true;
            }
            setTimeout(() => {
                if (copyStatusElement) copyStatusElement.textContent = '';
                if (copyButton) {
                    copyButton.textContent = 'Copy to Clipboard';
                    copyButton.disabled = false;
                }
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            if (copyStatusElement) copyStatusElement.textContent = 'Copy failed!';
            alert('Failed to copy text. Check browser permissions.');
        });
    }

    function handleDownload(event) {
        const filename = event.target.dataset.filename;
        const content = generatedContentElement?.textContent;
        if(filename && content) {
            saveFile(filename, content);
        } else {
            console.error("Missing filename or content for download.");
            alert("Could not initiate download. Content or filename missing.");
        }
    }

    function saveFile(filename, content) {
        const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
    }

} // End of initBoomiUtilsApp
