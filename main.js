document.addEventListener('DOMContentLoaded', () => {
  window.boomiXmlDoc = null;
  window.profileType = null; // 'EDI' or 'XML' or null

  const fileInputElement = document.getElementById('fileInput');
  const xmlInputAreaElement = document.getElementById('xmlInputArea');
  const previewAreaElement = document.getElementById('previewArea');
  const statusMessageElement = document.getElementById('statusMessage');
  const generateXsdButton = document.getElementById('generateXsd');
  const generateTagsButton = document.getElementById('generateTags');
  const generateTagsAndRenameButton = document.getElementById('generateTagsAndRename');
  const generatedOutputContainer = document.getElementById('generatedOutputContainer');
  const generatedContentElement = document.getElementById('generatedContent');
  const copyButton = document.getElementById('copyButton');
  const copyStatusElement = document.getElementById('copyStatus');
  const downloadButton = document.getElementById('downloadButton');
  const includeValidationCheckbox = document.getElementById('includeValidation');


  fileInputElement.addEventListener('change', handleFileInputChange);
  xmlInputAreaElement.addEventListener('input', handleTextInputChange);

  function handleFileInputChange(event) {
      const file = event.target.files[0]; if (!file) return;
      statusMessageElement.textContent = `Reading file: ${file.name}...`;
      previewAreaElement.textContent = ''; previewAreaElement.classList.remove('error');
      generatedOutputContainer.style.display = 'none';
      const reader = new FileReader();
      reader.onload = function (e) { const xmlString = e.target.result; xmlInputAreaElement.value = xmlString; processXmlString(xmlString); };
      reader.onerror = function(e) { console.error("Error reading file:", e); statusMessageElement.textContent = ''; previewAreaElement.textContent = 'Error reading the selected file.'; previewAreaElement.classList.add('error'); resetState(); };
      reader.readAsText(file);
  }
  function handleTextInputChange(event) {
       clearTimeout(window.inputTimeout); window.inputTimeout = setTimeout(() => {
          statusMessageElement.textContent = `Processing pasted text...`; previewAreaElement.textContent = ''; previewAreaElement.classList.remove('error');
          generatedOutputContainer.style.display = 'none'; fileInputElement.value = '';
          const xmlString = event.target.value; processXmlString(xmlString); }, 500);
  }

  function processXmlString(xmlString) {
      if (!xmlString || xmlString.trim() === '') { previewAreaElement.textContent = 'Load or paste a Boomi EDI or XML Profile XML file...'; statusMessageElement.textContent = ''; resetState(); return; }
      const parser = new DOMParser(); const xmlDoc = parser.parseFromString(xmlString, "application/xml");
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) { console.error("Error parsing XML:", parserError.textContent); previewAreaElement.textContent = `Error parsing XML:\n${parserError.textContent}`; previewAreaElement.classList.add('error'); statusMessageElement.textContent = 'XML Parsing Error.'; resetState(); return; }
      const ediProfileElement = xmlDoc.querySelector('EdiProfile'); const xmlProfileElement = xmlDoc.querySelector('XMLProfile');
      let profileName = xmlDoc.documentElement.getAttribute('name') || '[Unknown Profile Name]';
      if (ediProfileElement) { setProfileState('EDI', xmlDoc, profileName); try { previewAreaElement.textContent = parseBoomiEdiXmlForPreview(xmlDoc); } catch (err) { handlePreviewError(err, 'EDI'); } }
      else if (xmlProfileElement) { setProfileState('XML', xmlDoc, profileName); try { previewAreaElement.textContent = parseBoomiXmlProfileForPreview(xmlDoc); } catch (err) { handlePreviewError(err, 'XML'); } }
      else { const rootElementName = xmlDoc.documentElement ? xmlDoc.documentElement.tagName : 'N/A'; previewAreaElement.textContent = `Error: Could not find <EdiProfile> or <XMLProfile> element...`; previewAreaElement.classList.add('error'); statusMessageElement.textContent = 'Unrecognized Profile Type.'; resetState(); }
  }
  function setProfileState(type, xmlDoc, name) {
      window.profileType = type;
       window.boomiXmlDoc = xmlDoc.cloneNode(true);

      generateXsdButton.disabled = (type !== 'EDI');
      includeValidationCheckbox.disabled = (type !== 'EDI');
      if (type !== 'EDI') {
          includeValidationCheckbox.checked = false;
      }
      generateTagsButton.disabled = (type !== 'XML');
      generateTagsAndRenameButton.disabled = (type !== 'XML');

      statusMessageElement.textContent = `${type} Profile Loaded: ${name}`;
      previewAreaElement.classList.remove('error');
      generatedOutputContainer.style.display = 'none';
      copyStatusElement.textContent = '';
  }

 function resetState() {
      window.profileType = null;
      window.boomiXmlDoc = null;
      generateXsdButton.disabled = true;
      generateTagsButton.disabled = true;
      generateTagsAndRenameButton.disabled = true;
      includeValidationCheckbox.disabled = true;
      includeValidationCheckbox.checked = false;
      generatedOutputContainer.style.display = 'none';
  }

  function handlePreviewError(error, type) {
       console.error(`Error generating ${type} preview:`, error); previewAreaElement.textContent = `Preview generation error for ${type} profile: ${error.message}`; previewAreaElement.classList.add('error'); statusMessageElement.textContent = 'Error generating preview.';
  }

  generateXsdButton.addEventListener('click', function () {
      if (!window.boomiXmlDoc || window.profileType !== 'EDI') { alert('Please load an EDI Profile first.'); return; }
      try {
          statusMessageElement.textContent = 'Generating XSD...';
          const includeValidation = includeValidationCheckbox.checked;
          const xsdString = generateXsd(window.boomiXmlDoc.cloneNode(true), includeValidation);
          displayGeneratedOutput(xsdString, 'Generated XSD', 'XSD', 'xsdFromEdiToImport.xsd');
          statusMessageElement.textContent = 'XSD Generation Complete.';
      } catch (error) { handleActionError(error, 'XSD generation'); }
  });

  generateTagsButton.addEventListener('click', function () {
      if (!window.boomiXmlDoc || window.profileType !== 'XML') { alert('Please load an XML Profile first.'); return; }
      try {
          statusMessageElement.textContent = 'Generating/Updating TagLists...';
           const docClone = window.boomiXmlDoc.cloneNode(true);
          const modifiedXmlString = generateTagListsForXmlProfile(docClone);
          if (modifiedXmlString) {
              displayGeneratedOutput(modifiedXmlString, 'Profile XML with TagLists', 'ProfileXML', 'profile_with_tags.xml');
              statusMessageElement.textContent = 'TagList Generation/Update Complete.';
          } else { throw new Error("TagList generation returned empty result."); }
      } catch (error) { handleActionError(error, 'TagList generation'); }
  });

  generateTagsAndRenameButton.addEventListener('click', function () {
      if (!window.boomiXmlDoc || window.profileType !== 'XML') { alert('Please load an XML Profile first.'); return; }
      try {
          statusMessageElement.textContent = 'Renaming Elements & Generating Tags...';
           const docClone = window.boomiXmlDoc.cloneNode(true);
          const modifiedXmlString = generateTagListsAndRenameElements(docClone);
          if (modifiedXmlString) {
              displayGeneratedOutput(modifiedXmlString, 'Renamed Profile XML with TagLists', 'ProfileXML', 'profile_renamed_with_tags.xml');
              statusMessageElement.textContent = 'Element Renaming & TagList Generation Complete.';
          } else { throw new Error("Renaming/TagList generation returned empty result."); }
      } catch (error) { handleActionError(error, 'Element Renaming & TagList generation'); }
  });

  function displayGeneratedOutput(content, title, outputType, suggestedFilename) {
       generatedContentElement.textContent = content;
       generatedOutputContainer.querySelector('h2').textContent = title + ':';
       generatedOutputContainer.style.display = 'block';
       copyStatusElement.textContent = '';
       copyButton.textContent = 'Copy to Clipboard';
       copyButton.disabled = false;

       if (outputType === 'XSD') {
           downloadButton.style.display = 'inline-block';
           downloadButton.dataset.filename = suggestedFilename;
       } else {
           downloadButton.style.display = 'none';
           delete downloadButton.dataset.filename;
       }

       generatedOutputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleActionError(error, actionName) {
       console.error(`Error during ${actionName}:`, error); previewAreaElement.textContent += `\n\nError during ${actionName}: ${error.message}`; previewAreaElement.classList.add('error'); statusMessageElement.textContent = `Error during ${actionName}.`; generatedOutputContainer.style.display = 'none';
  }

  copyButton.addEventListener('click', function() {
      const textToCopy = generatedContentElement.textContent; if (!textToCopy) return;
      navigator.clipboard.writeText(textToCopy).then(() => { copyStatusElement.textContent = 'Copied!'; copyButton.textContent = 'Copied!'; copyButton.disabled = true; setTimeout(() => { copyStatusElement.textContent = ''; copyButton.textContent = 'Copy to Clipboard'; copyButton.disabled = false; }, 2000);
      }).catch(err => { console.error('Failed to copy text: ', err); copyStatusElement.textContent = 'Copy failed!'; alert('Failed to copy text.'); });
  });

  downloadButton.addEventListener('click', function(event) {
       const filename = event.target.dataset.filename;
       const content = generatedContentElement.textContent;
       if(filename && content) {
          saveFile(filename, content);
       } else {
           console.error("Missing filename or content for download.");
           alert("Could not initiate download. Content or filename missing.");
       }
  });

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