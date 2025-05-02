document.addEventListener('DOMContentLoaded', () => {
    // --- Global Variables ---
    window.boomiXmlDoc = null; // Holds the parsed XML document
    window.profileType = null; // 'EDI' or 'XML' or null
  
    // --- DOM Element References ---
    const fileInputElement = document.getElementById('fileInput');
    const xmlInputAreaElement = document.getElementById('xmlInputArea');
    const previewAreaElement = document.getElementById('previewArea');
    const statusMessageElement = document.getElementById('statusMessage');
    const generateXsdButton = document.getElementById('generateXsd');
    const renameOnlyButton = document.getElementById('renameOnly'); // New button
    const generateTagsButton = document.getElementById('generateTags');
    const generateTagsAndRenameButton = document.getElementById('generateTagsAndRename');
    const generatedOutputContainer = document.getElementById('generatedOutputContainer');
    const generatedContentElement = document.getElementById('generatedContent');
    const copyButton = document.getElementById('copyButton');
    const copyStatusElement = document.getElementById('copyStatus');
    const downloadButton = document.getElementById('downloadButton');
    const includeValidationCheckbox = document.getElementById('includeValidation');
    const fileNameDisplay = document.getElementById('fileName'); // For file name display
  
    // --- Event Listeners ---
    fileInputElement.addEventListener('change', handleFileInputChange);
    xmlInputAreaElement.addEventListener('input', handleTextInputChange);
    generateXsdButton.addEventListener('click', handleGenerateXsd);
    renameOnlyButton.addEventListener('click', handleRenameOnly); // New listener
    generateTagsButton.addEventListener('click', handleGenerateTags);
    generateTagsAndRenameButton.addEventListener('click', handleGenerateTagsAndRename);
    copyButton.addEventListener('click', handleCopy);
    downloadButton.addEventListener('click', handleDownload);
  
    // Listener for file input to show the chosen file name
    if (fileInput && fileNameDisplay) {
      fileInput.addEventListener('change', function() {
          fileNameDisplay.textContent = (this.files && this.files.length > 0) ? this.files[0].name : 'No file chosen';
      });
    }
  
    // --- Input Handling Functions ---
    function handleFileInputChange(event) {
        const file = event.target.files[0];
        if (!file) return;
        statusMessageElement.textContent = `Reading file: ${file.name}...`;
        previewAreaElement.textContent = '';
        previewAreaElement.classList.remove('error');
        generatedOutputContainer.style.display = 'none';
        const reader = new FileReader();
        reader.onload = function (e) {
            const xmlString = e.target.result;
            xmlInputAreaElement.value = xmlString; // Update text area as well
            processXmlString(xmlString);
        };
        reader.onerror = function(e) {
            console.error("Error reading file:", e);
            statusMessageElement.textContent = '';
            previewAreaElement.textContent = 'Error reading the selected file.';
            previewAreaElement.classList.add('error');
            resetState();
        };
        reader.readAsText(file);
    }
  
    // Debounce text input changes
    let inputTimeout;
    function handleTextInputChange(event) {
         clearTimeout(inputTimeout);
         inputTimeout = setTimeout(() => {
            statusMessageElement.textContent = `Processing pasted text...`;
            previewAreaElement.textContent = '';
            previewAreaElement.classList.remove('error');
            generatedOutputContainer.style.display = 'none';
            fileInputElement.value = ''; // Clear file input if text is pasted
            fileNameDisplay.textContent = 'No file chosen'; // Reset file name display
            const xmlString = event.target.value;
            processXmlString(xmlString);
        }, 500); // Process after 500ms of inactivity
    }
  
    function processXmlString(xmlString) {
        if (!xmlString || xmlString.trim() === '') {
            previewAreaElement.textContent = 'Load or paste a Boomi EDI or XML Profile XML file...';
            statusMessageElement.textContent = '';
            resetState();
            return;
        }
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");
        const parserError = xmlDoc.querySelector('parsererror');
  
        if (parserError) {
            console.error("Error parsing XML:", parserError.textContent);
            previewAreaElement.textContent = `Error parsing XML:\n${parserError.textContent}`;
            previewAreaElement.classList.add('error');
            statusMessageElement.textContent = 'XML Parsing Error.';
            resetState();
            return;
        }
  
        const ediProfileElement = xmlDoc.querySelector('EdiProfile');
        const xmlProfileElement = xmlDoc.querySelector('XMLProfile');
        let profileName = xmlDoc.documentElement.getAttribute('name') || '[Unknown Profile Name]';
  
        if (ediProfileElement) {
            setProfileState('EDI', xmlDoc, profileName);
            try {
                previewAreaElement.textContent = parseBoomiEdiXmlForPreview(xmlDoc);
            } catch (err) {
                handlePreviewError(err, 'EDI');
            }
        } else if (xmlProfileElement) {
            setProfileState('XML', xmlDoc, profileName);
            try {
                previewAreaElement.textContent = parseBoomiXmlProfileForPreview(xmlDoc);
            } catch (err) {
                handlePreviewError(err, 'XML');
            }
        } else {
            const rootElementName = xmlDoc.documentElement ? xmlDoc.documentElement.tagName : 'N/A';
            previewAreaElement.textContent = `Error: Could not find <EdiProfile> or <XMLProfile> element (Root: <${rootElementName}>). Is this a Boomi Profile Component XML?`;
            previewAreaElement.classList.add('error');
            statusMessageElement.textContent = 'Unrecognized Profile Type.';
            resetState();
        }
    }
  
    // --- State Management ---
    function setProfileState(type, xmlDoc, name) {
        window.profileType = type;
        window.boomiXmlDoc = xmlDoc.cloneNode(true); // Store a clone
  
        // Enable/disable buttons based on profile type
        generateXsdButton.disabled = (type !== 'EDI');
        includeValidationCheckbox.disabled = (type !== 'EDI');
        renameOnlyButton.disabled = (type !== 'XML'); // Enable for XML
        generateTagsButton.disabled = (type !== 'XML');
        generateTagsAndRenameButton.disabled = (type !== 'XML');
  
        if (type !== 'EDI') {
            includeValidationCheckbox.checked = false; // Reset checkbox if not EDI
        }
  
        statusMessageElement.textContent = `${type} Profile Loaded: ${name}`;
        previewAreaElement.classList.remove('error');
        generatedOutputContainer.style.display = 'none'; // Hide output on new load
        copyStatusElement.textContent = ''; // Clear copy status
    }
  
   function resetState() {
        window.profileType = null;
        window.boomiXmlDoc = null;
        generateXsdButton.disabled = true;
        renameOnlyButton.disabled = true; // Disable new button
        generateTagsButton.disabled = true;
        generateTagsAndRenameButton.disabled = true;
        includeValidationCheckbox.disabled = true;
        includeValidationCheckbox.checked = false;
        generatedOutputContainer.style.display = 'none';
        // Optionally clear preview/status here if desired
        // previewAreaElement.textContent = 'Load or paste a Boomi EDI or XML Profile XML file...';
        // statusMessageElement.textContent = '';
    }
  
    function handlePreviewError(error, type) {
         console.error(`Error generating ${type} preview:`, error);
         previewAreaElement.textContent = `Preview generation error for ${type} profile: ${error.message}`;
         previewAreaElement.classList.add('error');
         statusMessageElement.textContent = 'Error generating preview.';
    }
  
    // --- Action Handlers ---
    function handleGenerateXsd() {
        if (!window.boomiXmlDoc || window.profileType !== 'EDI') {
            alert('Please load an EDI Profile first.');
            return;
        }
        try {
            statusMessageElement.textContent = 'Generating XSD...';
            const includeValidation = includeValidationCheckbox.checked;
            // Pass a clone to the generation function
            const xsdString = generateXsd(window.boomiXmlDoc.cloneNode(true), includeValidation);
            displayGeneratedOutput(xsdString, 'Generated XSD', 'XSD', 'xsdFromEdiToImport.xsd');
            statusMessageElement.textContent = 'XSD Generation Complete.';
        } catch (error) {
            handleActionError(error, 'XSD generation');
        }
    }
  
    // New Handler for Rename Only button
    function handleRenameOnly() {
        if (!window.boomiXmlDoc || window.profileType !== 'XML') {
            alert('Please load an XML Profile first.');
            return;
        }
        try {
            statusMessageElement.textContent = 'Renaming Elements...';
            // Pass a clone to the rename function
            const modifiedXmlString = renameElementsOnly(window.boomiXmlDoc.cloneNode(true));
            if (modifiedXmlString) {
                displayGeneratedOutput(modifiedXmlString, 'Renamed Profile XML (Descriptive Names)', 'ProfileXML', 'profile_renamed.xml');
                statusMessageElement.textContent = 'Element Renaming Complete.';
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
            statusMessageElement.textContent = 'Generating/Updating TagLists...';
             // Pass a clone to the generation function
            const modifiedXmlString = generateTagListsForXmlProfile(window.boomiXmlDoc.cloneNode(true));
            if (modifiedXmlString) {
                displayGeneratedOutput(modifiedXmlString, 'Profile XML with TagLists', 'ProfileXML', 'profile_with_tags.xml');
                statusMessageElement.textContent = 'TagList Generation/Update Complete.';
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
            statusMessageElement.textContent = 'Renaming Elements & Generating Tags...';
             // Pass a clone to the generation function
            const modifiedXmlString = generateTagListsAndRenameElements(window.boomiXmlDoc.cloneNode(true));
            if (modifiedXmlString) {
                displayGeneratedOutput(modifiedXmlString, 'Renamed Profile XML with TagLists', 'ProfileXML', 'profile_renamed_with_tags.xml');
                statusMessageElement.textContent = 'Element Renaming & TagList Generation Complete.';
            } else {
                throw new Error("Renaming/TagList generation returned empty result.");
            }
        } catch (error) {
            handleActionError(error, 'Element Renaming & TagList generation');
        }
    }
  
    function handleActionError(error, actionName) {
         console.error(`Error during ${actionName}:`, error);
         previewAreaElement.textContent += `\n\nError during ${actionName}: ${error.message}`;
         previewAreaElement.classList.add('error');
         statusMessageElement.textContent = `Error during ${actionName}.`;
         generatedOutputContainer.style.display = 'none';
    }
  
    // --- Output Handling ---
    function displayGeneratedOutput(content, title, outputType, suggestedFilename) {
         generatedContentElement.textContent = content; // Use textContent for preformatted text
         generatedOutputContainer.querySelector('h2').textContent = title + ':';
         generatedOutputContainer.style.display = 'block';
         copyStatusElement.textContent = ''; // Reset copy status
         copyButton.textContent = 'Copy to Clipboard';
         copyButton.disabled = false;
  
         // Show download button only for file types we want to allow download for
         if (outputType === 'XSD' || outputType === 'ProfileXML') {
             downloadButton.style.display = 'inline-block';
             downloadButton.dataset.filename = suggestedFilename;
         } else {
             downloadButton.style.display = 'none';
             delete downloadButton.dataset.filename;
         }
  
         // Scroll the output into view
         generatedOutputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  
    function handleCopy() {
        const textToCopy = generatedContentElement.textContent;
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            copyStatusElement.textContent = 'Copied!';
            copyButton.textContent = 'Copied!';
            copyButton.disabled = true;
            setTimeout(() => { // Reset button after 2 seconds
                copyStatusElement.textContent = '';
                copyButton.textContent = 'Copy to Clipboard';
                copyButton.disabled = false;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            copyStatusElement.textContent = 'Copy failed!';
            alert('Failed to copy text. Check browser permissions.');
        });
    }
  
    function handleDownload(event) {
         const filename = event.target.dataset.filename;
         const content = generatedContentElement.textContent;
         if(filename && content) {
            saveFile(filename, content);
         } else {
             console.error("Missing filename or content for download.");
             alert("Could not initiate download. Content or filename missing.");
         }
    }
  
     function saveFile(filename, content) {
       // Creates a Blob and initiates a download link click
       const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
       const link = document.createElement('a');
       link.href = URL.createObjectURL(blob);
       link.download = filename;
       document.body.appendChild(link); // Append link to body
       link.click(); // Simulate click
       document.body.removeChild(link); // Remove link from body
       setTimeout(() => URL.revokeObjectURL(link.href), 100); // Clean up blob URL
     }
  
  }); // End DOMContentLoaded
  