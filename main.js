document.addEventListener('DOMContentLoaded', () => {
    // --- Global Variables ---
    window.boomiXmlDoc = null; // Holds the parsed XML document of the *input* profile
    window.profileType = null; // 'EDI' or 'XML' or null
    window.currentOutputType = null; // 'XSD' or 'ProfileXML' or null - Tracks what's in the output area
  
    // --- DOM Element References ---
    const fileInputElement = document.getElementById('fileInput');
    const xmlInputAreaElement = document.getElementById('xmlInputArea');
    const previewAreaElement = document.getElementById('previewArea');
    const statusMessageElement = document.getElementById('statusMessage');
    const generateXsdButton = document.getElementById('generateXsd');
    const removeLengthValidationButton = document.getElementById('removeLengthValidation'); // New button
    const renameOnlyButton = document.getElementById('renameOnly');
    const generateTagsButton = document.getElementById('generateTags');
    const generateTagsAndRenameButton = document.getElementById('generateTagsAndRename');
    const generatedOutputContainer = document.getElementById('generatedOutputContainer');
    const generatedContentElement = document.getElementById('generatedContent');
    const copyButton = document.getElementById('copyButton');
    const copyStatusElement = document.getElementById('copyStatus');
    const downloadButton = document.getElementById('downloadButton');
    // Removed includeValidationCheckbox reference
    const fileNameDisplay = document.getElementById('fileName');
  
    // --- Event Listeners ---
    fileInputElement.addEventListener('change', handleFileInputChange);
    xmlInputAreaElement.addEventListener('input', handleTextInputChange);
    generateXsdButton.addEventListener('click', handleGenerateXsd);
    removeLengthValidationButton.addEventListener('click', handleRemoveLengthValidation); // New listener
    renameOnlyButton.addEventListener('click', handleRenameOnly);
    generateTagsButton.addEventListener('click', handleGenerateTags);
    generateTagsAndRenameButton.addEventListener('click', handleGenerateTagsAndRename);
    copyButton.addEventListener('click', handleCopy);
    downloadButton.addEventListener('click', handleDownload);
  
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
        generatedOutputContainer.style.display = 'none'; // Hide output on new input
        window.currentOutputType = null; // Reset output type tracker
        const reader = new FileReader();
        reader.onload = function (e) {
            const xmlString = e.target.result;
            xmlInputAreaElement.value = xmlString;
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
  
    let inputTimeout;
    function handleTextInputChange(event) {
         clearTimeout(inputTimeout);
         inputTimeout = setTimeout(() => {
            statusMessageElement.textContent = `Processing pasted text...`;
            previewAreaElement.textContent = '';
            previewAreaElement.classList.remove('error');
            generatedOutputContainer.style.display = 'none'; // Hide output on new input
            window.currentOutputType = null; // Reset output type tracker
            fileInputElement.value = '';
            fileNameDisplay.textContent = 'No file chosen';
            const xmlString = event.target.value;
            processXmlString(xmlString);
        }, 500);
    }
  
    function processXmlString(xmlString) {
        if (!xmlString || xmlString.trim() === '') {
            previewAreaElement.textContent = 'Load or paste a Boomi EDI or XML Profile XML file...';
            statusMessageElement.textContent = '';
            resetState();
            return;
        }
        // Always disable the remove length button when processing new input
        removeLengthValidationButton.disabled = true;
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
        window.boomiXmlDoc = xmlDoc.cloneNode(true);
  
        generateXsdButton.disabled = (type !== 'EDI');
        // removeLengthValidationButton is handled by displayGeneratedOutput
        renameOnlyButton.disabled = (type !== 'XML');
        generateTagsButton.disabled = (type !== 'XML');
        generateTagsAndRenameButton.disabled = (type !== 'XML');
  
        // Validation checkbox removed, no logic needed here
  
        statusMessageElement.textContent = `${type} Profile Loaded: ${name}`;
        previewAreaElement.classList.remove('error');
        generatedOutputContainer.style.display = 'none';
        window.currentOutputType = null; // Reset output type tracker
        copyStatusElement.textContent = '';
        removeLengthValidationButton.disabled = true; // Ensure disabled on profile type change
    }
  
   function resetState() {
        window.profileType = null;
        window.boomiXmlDoc = null;
        window.currentOutputType = null;
        generateXsdButton.disabled = true;
        removeLengthValidationButton.disabled = true; // Disable new button
        renameOnlyButton.disabled = true;
        generateTagsButton.disabled = true;
        generateTagsAndRenameButton.disabled = true;
        // Validation checkbox removed
        generatedOutputContainer.style.display = 'none';
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
            statusMessageElement.textContent = 'Generating XSD (Validation Included)...';
            // Pass clone, no longer passing validation flag (it's always true now)
            const xsdString = generateXsd(window.boomiXmlDoc.cloneNode(true));
            displayGeneratedOutput(xsdString, 'Generated XSD', 'XSD', 'xsdFromEdiToImport.xsd');
            statusMessageElement.textContent = 'XSD Generation Complete.';
        } catch (error) {
            handleActionError(error, 'XSD generation');
        }
    }
  
    // New Handler for Remove Length Validation button
    function handleRemoveLengthValidation() {
        const currentXsd = generatedContentElement.textContent;
        if (!currentXsd || window.currentOutputType !== 'XSD') {
            alert('No XSD found in the output area to modify.');
            return;
        }
         // *** REMOVED CONFIRMATION POPUP ***
         /*
         if (!confirm("This will remove minLength and maxLength restrictions from the currently displayed XSD. Continue?")) {
              return;
          }
         */
        try {
            statusMessageElement.textContent = 'Removing Length Validation from XSD...';
            const modifiedXsdString = removeLengthRestrictionsFromXsd(currentXsd);
            if (modifiedXsdString) {
                // Display the modified XSD, keep type as 'XSD' but suggest different filename
                displayGeneratedOutput(modifiedXsdString, 'Generated XSD (Length Validation Removed)', 'XSD', 'xsd_no_length_validation.xsd');
                statusMessageElement.textContent = 'Length Validation Removal Complete.';
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
            statusMessageElement.textContent = 'Renaming Elements...';
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
         window.currentOutputType = null; // Reset output type on error
         removeLengthValidationButton.disabled = true; // Disable button on error
    }
  
    // --- Output Handling ---
    function displayGeneratedOutput(content, title, outputType, suggestedFilename) {
         generatedContentElement.textContent = content;
         generatedOutputContainer.querySelector('h2').textContent = title + ':';
         generatedOutputContainer.style.display = 'block';
         window.currentOutputType = outputType; // Track the type of content displayed
         copyStatusElement.textContent = '';
         copyButton.textContent = 'Copy to Clipboard';
         copyButton.disabled = false;
  
         // Enable the "Remove Length Validation" button ONLY if XSD is displayed
         removeLengthValidationButton.disabled = (outputType !== 'XSD');
  
         if (outputType === 'XSD' || outputType === 'ProfileXML') {
             downloadButton.style.display = 'inline-block';
             downloadButton.dataset.filename = suggestedFilename;
         } else {
             downloadButton.style.display = 'none';
             delete downloadButton.dataset.filename;
         }
  
         generatedOutputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  
    function handleCopy() {
        const textToCopy = generatedContentElement.textContent;
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            copyStatusElement.textContent = 'Copied!';
            copyButton.textContent = 'Copied!';
            copyButton.disabled = true;
            setTimeout(() => {
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
       const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
       const link = document.createElement('a');
       link.href = URL.createObjectURL(blob);
       link.download = filename;
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       setTimeout(() => URL.revokeObjectURL(link.href), 100);
     }
  
  }); // End DOMContentLoaded
  