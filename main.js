document.getElementById('fileInput').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (!file) return;
  
    const reader = new FileReader();
    reader.onload = function (e) {
      const xmlString = e.target.result;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  
      const preview = parseBoomiXml(xmlDoc);
      document.getElementById('output').textContent = preview;
  
      window.boomiXmlDoc = xmlDoc;
    };
    reader.readAsText(file);
  });
  
  document.getElementById('generateXsd').addEventListener('click', function () {
    if (!window.boomiXmlDoc) {
      alert('Please upload a Boomi EDI XML file first.');
      return;
    }
    const xsdString = generateXsd(window.boomiXmlDoc);
    saveFile('generated.xsd', xsdString);
  });
  
  function toSnakeCase(str) {
    return str
      .replace(/[^\w\s]/gi, '')    
      .replace(/\s+/g, '_');       
  }
  
  function cleanName(name) {
    if (/^\d/.test(name)) {
      return `Item_${name}`;
    }
    return name.replace(/[^\w\s\-]/g, '_');  
  }
  
  function parseBoomiXml(xmlDoc) {
    const lines = [];
  
    function walkLoop(loopNode, depth = 0) {
      const indent = '  '.repeat(depth);
      const rawLoopName = loopNode.getAttribute('name') || 'Loop';
      const loopName = cleanName(rawLoopName);
      const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
      const loopingOption = loopNode.getAttribute('loopingOption') || 'unique';
  
      lines.push(`${indent}<${loopName} repeat="${loopRepeat}" option="${loopingOption}">`);
  
      let previousSegmentName = ''; // Keep track of the previous segment name
      let segmentCount = 0;
  
      loopNode.querySelectorAll(':scope > EdiSegment').forEach(seg => {
        const rawSegName = seg.getAttribute('name') || 'Segment';
        let segName = cleanName(rawSegName);
        const maxUse = seg.getAttribute('maxUse') || '1';
        const mandatory = seg.getAttribute('mandatory') || 'false';
  
        // Handle segment repetition within the same loop
        if (segName === previousSegmentName) {
          segmentCount++;
          segName = `${segName}_${segmentCount}`; // Append a counter
        } else {
          segmentCount = 0; // Reset the counter for a new segment name
        }
        previousSegmentName = segName; // Update the previous segment name
  
        lines.push(`${indent}  <${segName} maxUse="${maxUse}" mandatory="${mandatory}">`);
  
        seg.querySelectorAll('EdiDataElement').forEach(el => {
          const elName = el.getAttribute('name') || 'Element';
          const elPurpose = el.getAttribute('elementPurpose') || '';
          const elType = el.getAttribute('dataType') || 'string';
          const minLength = el.getAttribute('minLength') || '';
          const maxLength = el.getAttribute('maxLength') || '';
          const qualifier = el.querySelector('QualifierList')
            ? Array.from(el.querySelectorAll('QualifierList')).map(q => q.getAttribute('codeList')).join(',')
            : '';
  
          const cleanPurpose = toSnakeCase(elPurpose);
          const finalName = cleanName(`${elName}`);
  
          lines.push(`${indent}    <${finalName} type="${elType}" minLength="${minLength}" maxLength="${maxLength}" qualifier="${qualifier}" />`);
        });
  
        lines.push(`${indent}  </${segName}>`);
      });
  
      loopNode.querySelectorAll(':scope > EdiLoop').forEach(childLoop => {
        walkLoop(childLoop, depth + 1);
      });
  
      lines.push(`${indent}</${loopName}>`);
    }
  
    const rootLoops = xmlDoc.querySelectorAll('EdiLoop');
    rootLoops.forEach(loop => walkLoop(loop));
  
    return lines.join('\n');
  }
  
  function generateXsd(xmlDoc) {
    let xsd = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xsd += `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n`;
    xsd += `<xs:element name="Root">\n`;
    xsd += `<xs:complexType>\n<xs:sequence>\n`;
  
    function mapType(ediType) {
      switch (ediType) {
        case 'ID':
        case 'AN':
          return 'xs:string';
        case 'DT':
          return 'xs:date';
        case 'TM':
          return 'xs:time';
        case 'R':
        case 'N0':
        case 'N2':
          return 'xs:decimal';
        default:
          return 'xs:string';
      }
    }
  
    function walkLoop(loopNode, depth = 2) {
      const rawLoopName = loopNode.getAttribute('name') || 'Loop';
      const loopName = cleanName(rawLoopName);
      const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
      const minOccurs = '0';
      const maxOccurs = loopRepeat === '-1' ? 'unbounded' : loopRepeat;
  
      xsd += `${'  '.repeat(depth)}<xs:element name="${loopName}" minOccurs="${minOccurs}" maxOccurs="${maxOccurs}">\n`;
      xsd += `${'  '.repeat(depth + 1)}<xs:complexType>\n`;
      xsd += `${'  '.repeat(depth + 2)}<xs:sequence>\n`;
  
      let previousSegmentName = '';
      let segmentCount = 0;
  
      loopNode.querySelectorAll(':scope > EdiSegment').forEach(seg => {
        const rawSegName = seg.getAttribute('name') || 'Segment';
        let segName = cleanName(rawSegName);
        const segMax = seg.getAttribute('maxUse') || '1';
        const segMandatory = seg.getAttribute('mandatory') === 'true';
        const segMinOccurs = segMandatory ? '1' : '0';
        const segMaxOccurs = segMax === '-1' ? 'unbounded' : segMax;
  
         if (segName === previousSegmentName) {
          segmentCount++;
          segName = `${segName}_${segmentCount}`;
        } else {
          segmentCount = 0;
        }
        previousSegmentName = segName;
  
        xsd += `${'  '.repeat(depth + 2)}<xs:element name="${segName}" minOccurs="${segMinOccurs}" maxOccurs="${segMaxOccurs}">\n`;
        xsd += `${'  '.repeat(depth + 3)}<xs:complexType>\n`;
        xsd += `${'  '.repeat(depth + 4)}<xs:sequence>\n`;
  
        seg.querySelectorAll('EdiDataElement').forEach(el => {
          const elName = el.getAttribute('name') || 'Element';
          const elPurpose = el.getAttribute('elementPurpose') || '';
          const elType = el.getAttribute('dataType') || 'string';
          const elMandatory = el.getAttribute('mandatory') === 'true';
          const elMinOccurs = elMandatory ? '1' : '0';
          const elMaxOccurs = '1';
  
          const cleanPurpose = toSnakeCase(elPurpose);
          const finalName = cleanName(`${elName}`);
          const xsdType = mapType(elType);
  
          xsd += `${'  '.repeat(depth + 4)}<xs:element name="${finalName}" type="${xsdType}" minOccurs="${elMinOccurs}" maxOccurs="${elMaxOccurs}"/>\n`;
        });
  
        xsd += `${'  '.repeat(depth + 4)}</xs:sequence>\n`;
        xsd += `${'  '.repeat(depth + 3)}</xs:complexType>\n`;
        xsd += `${'  '.repeat(depth + 2)}</xs:element>\n`;
      });
  
      loopNode.querySelectorAll(':scope > EdiLoop').forEach(childLoop => {
        walkLoop(childLoop, depth + 2);
      });
  
      xsd += `${'  '.repeat(depth + 2)}</xs:sequence>\n`;
      xsd += `${'  '.repeat(depth + 1)}</xs:complexType>\n`;
      xsd += `${'  '.repeat(depth)}</xs:element>\n`;
    }
  
    xmlDoc.querySelectorAll('EdiLoop').forEach(loop => walkLoop(loop, 2));
  
    xsd += `</xs:sequence>\n</xs:complexType>\n</xs:element>\n`;
    xsd += `</xs:schema>\n`;
    return xsd;
  }
  
  function saveFile(filename, content) {
    const blob = new Blob([content], { type: 'text/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  }
  