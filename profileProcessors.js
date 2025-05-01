function toSnakeCase(str) {
    if (!str) return '';
    return str.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').replace(/__+/g, '_').toLowerCase();
}

function cleanName(name) {
    if (!name) return 'UnnamedElement';
    let cleaned = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (/^[\d\-]/.test(cleaned)) cleaned = `_${cleaned}`;
    if (cleaned.toLowerCase().startsWith('xml')) cleaned = `_${cleaned}`;
    if (!cleaned) return 'EmptyElementName';
    return cleaned;
}

function mapType(ediType) {
     switch (ediType ? ediType.toUpperCase() : '') {
        case 'ID': case 'AN': return 'xs:string'; case 'R': return 'xs:string';
        case 'N0': case 'N1': case 'N2': case 'N3': case 'N4': case 'N5':
        case 'N6': case 'N7': case 'N8': case 'N9': return 'xs:string';
        case 'DT': return 'xs:string'; case 'TM': return 'xs:string'; default: return 'xs:string';
     }
}

function parseTagLists(xmlDoc) {
    const tagMap = new Map();
    const tagListsNodes = xmlDoc.querySelectorAll('EdiProfile > tagLists > TagList');

    tagListsNodes.forEach(tagList => {
        const elementKey = tagList.getAttribute('elementKey');
        const listKey = tagList.getAttribute('listKey');
        if (!elementKey) return;

        const expressions = tagList.querySelectorAll('GroupingExpression > TagExpression');
        let docString = `TagList (listKey: ${listKey || 'N/A'}): Identifies instances where `;
        const conditions = [];

        expressions.forEach(expr => {
            const idName = expr.getAttribute('identifierName');
            const idType = expr.getAttribute('identifierType');
            const idValueNode = expr.querySelector('identifierValue');
            const idValue = idValueNode ? idValueNode.textContent : null;
            if (idName && idType === 'value' && idValue !== null) {
                conditions.push(`${idName} = "${idValue}"`);
            }
        });

        if (conditions.length > 0) {
            docString += conditions.join(' AND ');
            if (!tagMap.has(elementKey)) {
                tagMap.set(elementKey, []);
            }
            tagMap.get(elementKey).push(docString);
        }
    });
    return tagMap;
}

function generateXsd(xmlDoc, includeValidation) {
    if (window.profileType !== 'EDI') {
        return "";
    }

    let xsdParts = [];
    xsdParts.push(`<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n`);
    const profileName = xmlDoc.documentElement.getAttribute('name');
    const rootElementName = profileName ? cleanName(profileName) : 'EdiDocument';
    xsdParts.push(`${'  '.repeat(1)}<xs:element name="${rootElementName}">\n`);
    xsdParts.push(`${'  '.repeat(2)}<xs:complexType>\n`);
    xsdParts.push(`${'  '.repeat(3)}<xs:sequence>\n`);

    const tagDocumentation = parseTagLists(xmlDoc);

    function walkLoop(loopNode, depth = 3) {
        const loopKey = loopNode.getAttribute('key');
        const rawLoopName = loopNode.getAttribute('name') || 'Loop';
        const loopName = cleanName(rawLoopName);

        const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
        const mandatory = loopNode.getAttribute('mandatory') === 'true';
        const minOccurs = mandatory ? '1' : '0';
        const maxOccurs = loopRepeat === '-1' ? 'unbounded' : loopRepeat;

        xsdParts.push(`${'  '.repeat(depth)}<xs:element name="${loopName}" minOccurs="${minOccurs}" maxOccurs="${maxOccurs}">\n`);

        if (loopKey && tagDocumentation.has(loopKey)) {
            xsdParts.push(`${'  '.repeat(depth + 1)}<xs:annotation>\n`);
            tagDocumentation.get(loopKey).forEach(doc => {
                const escapedDoc = doc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                xsdParts.push(`${'  '.repeat(depth + 2)}<xs:documentation>${escapedDoc}</xs:documentation>\n`); });
            xsdParts.push(`${'  '.repeat(depth + 1)}</xs:annotation>\n`);
        }

        xsdParts.push(`${'  '.repeat(depth + 1)}<xs:complexType>\n`);
        xsdParts.push(`${'  '.repeat(depth + 2)}<xs:sequence>\n`);

        const children = Array.from(loopNode.children);
        let segmentNameCounts = {};

        children.forEach(child => {
            if (child.tagName === 'EdiSegment') {
                const seg = child;
                const rawSegName = seg.getAttribute('name') || 'Segment';
                const segPurpose = seg.getAttribute('segmentName');

                let baseSegName = cleanName(rawSegName);
                let finalSegName = baseSegName;
                if (segmentNameCounts[baseSegName] !== undefined) {
                     segmentNameCounts[baseSegName]++;
                     finalSegName = `${baseSegName}_${segmentNameCounts[baseSegName]}`;
                } else {
                     segmentNameCounts[baseSegName] = 0;
                }
                const segMax = seg.getAttribute('maxUse') || '1';
                const segMandatory = seg.getAttribute('mandatory') === 'true';
                const segMinOccurs = segMandatory ? '1' : '0';
                const segMaxOccurs = segMax === '-1' ? 'unbounded' : segMax;

                let segAnnotationString = '';
                 if (segPurpose) {
                     const escapedPurpose = segPurpose.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                     segAnnotationString = `${'  '.repeat(depth + 4)}<xs:annotation>\n${'  '.repeat(depth + 5)}<xs:documentation>Segment: ${escapedPurpose}</xs:documentation>\n${'  '.repeat(depth + 4)}</xs:annotation>\n`;
                 }

                xsdParts.push(`${'  '.repeat(depth + 3)}<xs:element name="${finalSegName}" minOccurs="${segMinOccurs}" maxOccurs="${segMaxOccurs}">\n`);
                 xsdParts.push(segAnnotationString);
                xsdParts.push(`${'  '.repeat(depth + 4)}<xs:complexType>\n`);
                xsdParts.push(`${'  '.repeat(depth + 5)}<xs:sequence>\n`);

                seg.querySelectorAll(':scope > EdiDataElement').forEach(el => {
                    const elName = el.getAttribute('name') || 'Element';
                    const elPurpose = el.getAttribute('elementPurpose');

                    const elType = el.getAttribute('dataType') || 'string';
                    const elMandatory = el.getAttribute('mandatory') === 'true';
                    const elMinOccurs = elMandatory ? '1' : '0';
                    const elMaxOccurs = '1';
                    const finalName = cleanName(elName);
                    const xsdType = mapType(elType);

                    let annotationString = '';
                    if (elPurpose) {
                         const escapedPurpose = elPurpose.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                         annotationString = `${'  '.repeat(depth + 6)}<xs:annotation>\n${'  '.repeat(depth + 7)}<xs:documentation>${escapedPurpose}</xs:documentation>\n${'  '.repeat(depth + 6)}</xs:annotation>\n`;
                     }

                    const minLength = el.getAttribute('minLength');
                    const maxLength = el.getAttribute('maxLength');
                    const qualifierNodes = el.querySelectorAll(':scope > QualifierList > Qualifier');
                    let enumerations = '';

                     if (includeValidation && qualifierNodes.length > 0) {
                         qualifierNodes.forEach(qNode => {
                             const qVal = qNode.getAttribute('qualifierValue');
                             if (qVal) {
                                 const escapedQVal = qVal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                 enumerations += `${'  '.repeat(depth + 9)}<xs:enumeration value="${escapedQVal}"/>\n`; } });
                     } else if (includeValidation) {
                         const codeListAttr = el.querySelector(':scope > QualifierList')?.getAttribute('codeList');
                         if (codeListAttr) {
                             enumerations += `${'  '.repeat(depth + 9)}\n`; }
                     }

                    const hasRestrictions = minLength || maxLength || (enumerations.trim() !== '');

                    if (includeValidation && hasRestrictions) {
                         xsdParts.push(`${'  '.repeat(depth + 6)}<xs:element name="${finalName}" minOccurs="${elMinOccurs}" maxOccurs="${elMaxOccurs}">\n`);
                         xsdParts.push(annotationString);
                         xsdParts.push(`${'  '.repeat(depth + 7)}<xs:simpleType>\n`);
                         xsdParts.push(`${'  '.repeat(depth + 8)}<xs:restriction base="${xsdType}">\n`);
                         if (minLength) { xsdParts.push(`${'  '.repeat(depth + 9)}<xs:minLength value="${minLength}"/>\n`); }
                         if (maxLength) { xsdParts.push(`${'  '.repeat(depth + 9)}<xs:maxLength value="${maxLength}"/>\n`); }
                         xsdParts.push(enumerations);
                         xsdParts.push(`${'  '.repeat(depth + 8)}</xs:restriction>\n`);
                         xsdParts.push(`${'  '.repeat(depth + 7)}</xs:simpleType>\n`);
                         xsdParts.push(`${'  '.repeat(depth + 6)}</xs:element>\n`);
                     } else {
                         xsdParts.push(`${'  '.repeat(depth + 6)}<xs:element name="${finalName}" type="${xsdType}" minOccurs="${elMinOccurs}" maxOccurs="${elMaxOccurs}">\n`);
                         xsdParts.push(annotationString);
                         xsdParts.push(`${'  '.repeat(depth + 6)}</xs:element>\n`);
                     }
                 });

                xsdParts.push(`${'  '.repeat(depth + 5)}</xs:sequence>\n`);
                xsdParts.push(`${'  '.repeat(depth + 4)}</xs:complexType>\n`);
                xsdParts.push(`${'  '.repeat(depth + 3)}</xs:element>\n`);

            } else if (child.tagName === 'EdiLoop') {
                walkLoop(child, depth + 3);
                segmentNameCounts = {};
            }
        });

        xsdParts.push(`${'  '.repeat(depth + 2)}</xs:sequence>\n`);
        xsdParts.push(`${'  '.repeat(depth + 1)}</xs:complexType>\n`);
        xsdParts.push(`${'  '.repeat(depth)}</xs:element>\n`);
    }

    const dataElementsNode = xmlDoc.querySelector('EdiProfile > DataElements');
    if (dataElementsNode) {
         dataElementsNode.querySelectorAll(':scope > EdiLoop').forEach(loop => walkLoop(loop, 3));
    } else {
         xsdParts.push(`\n`);
    }

    xsdParts.push(`${'  '.repeat(3)}</xs:sequence>\n`);
    xsdParts.push(`${'  '.repeat(2)}</xs:complexType>\n`);
    xsdParts.push(`${'  '.repeat(1)}</xs:element>\n`);
    xsdParts.push(`</xs:schema>\n`);

    return xsdParts.join('');
}

function generateTagListsForXmlProfile(xmlDoc) {
    console.log("Analyzing XML profile for qualifiers...");
    const xmlProfileNode = xmlDoc.querySelector('XMLProfile');
    if (!xmlProfileNode) throw new Error("Cannot find XMLProfile element.");
    const dataElementsNode = xmlProfileNode.querySelector(':scope > DataElements');
    if (!dataElementsNode) { console.warn("No DataElements found in XML Profile."); return new XMLSerializer().serializeToString(xmlDoc); }
    function findLoopingAncestorJs(elementNode) {
        let currentNode = elementNode.parentNode;
        while (currentNode && currentNode !== xmlDoc && currentNode !== xmlProfileNode) {
             if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.tagName === 'XMLElement' && currentNode.getAttribute('loopingOption') === 'unique') { return currentNode; }
             currentNode = currentNode.parentNode; }
        return null;
    }
    const tagsToGenerate = new Map();
    const allElements = dataElementsNode.querySelectorAll('XMLElement');
    console.log(`Found ${allElements.length} XMLElement(s) to scan.`);
    allElements.forEach(elementNode => {
        const qualifierList = elementNode.querySelector(':scope > QualifierList');
        if (qualifierList) {
            const explicitQualifiers = qualifierList.querySelectorAll(':scope > Qualifier[qualifierValue]');
            if (explicitQualifiers.length > 0) {
                 const qualValues = Array.from(explicitQualifiers).map(q => q.getAttribute('qualifierValue')).filter(val => val);
                 if (qualValues.length > 0) {
                     const qualifyingElementKey = elementNode.getAttribute('key'); const qualifyingElementName = elementNode.getAttribute('name');
                     if (!qualifyingElementKey || !qualifyingElementName) { console.warn("Skipping element with qualifiers but missing key/name:", elementNode); return; }
                     const containerNode = findLoopingAncestorJs(elementNode);
                     if (containerNode) {
                         const containerKey = containerNode.getAttribute('key');
                         if (containerKey) {
                             console.log(`Found qualifiers [${qualValues.join(',')}] on element key=${qualifyingElementKey} (${qualifyingElementName}) belonging to container key=${containerKey}`);
                             if (!tagsToGenerate.has(containerKey)) { tagsToGenerate.set(containerKey, []); }
                             const containerTags = tagsToGenerate.get(containerKey);
                             const uniqueSortedQuals = [...new Set(qualValues)].sort();
                             uniqueSortedQuals.forEach(qVal => { const exists = containerTags.some(t => t.ident_key === qualifyingElementKey && t.qual_value === qVal); if (!exists) { containerTags.push({ ident_key: qualifyingElementKey, ident_name: qualifyingElementName, qual_value: qVal }); } });
                         } else { console.warn(`Container node found for element key=${qualifyingElementKey} but container has no key.`); }
                     } else { console.warn(`Could not find looping ancestor container for element key=${qualifyingElementKey}.`); } } } } });
    let existingTagLists = xmlProfileNode.querySelector(':scope > tagLists');
    if (existingTagLists) { console.log("Removing existing <tagLists> element."); xmlProfileNode.removeChild(existingTagLists); }
    const newTagLists = xmlDoc.createElement('tagLists');
    if (tagsToGenerate.size === 0) { console.log("No tag information found to generate. Adding empty <tagLists>."); }
    else {
        console.log(`Generating ${Array.from(tagsToGenerate.values()).flat().length} TagList entries.`);
        let listKeyCounter = 1; const sortedContainerKeys = [...tagsToGenerate.keys()].sort((a, b) => parseInt(a) - parseInt(b));
        sortedContainerKeys.forEach(containerKey => {
             const tags = tagsToGenerate.get(containerKey);
             tags.sort((a, b) => { const keyCompare = parseInt(a.ident_key) - parseInt(b.ident_key); if (keyCompare !== 0) return keyCompare; return a.qual_value.localeCompare(b.qual_value); });
             tags.forEach(tagInfo => {
                 const tagList = xmlDoc.createElement('TagList'); tagList.setAttribute('elementKey', containerKey); tagList.setAttribute('listKey', listKeyCounter.toString()); listKeyCounter++;
                 const groupingExpr = xmlDoc.createElement('GroupingExpression'); groupingExpr.setAttribute('operator', 'and');
                 const tagExpr = xmlDoc.createElement('TagExpression'); tagExpr.setAttribute('identifierKey', tagInfo.ident_key); tagExpr.setAttribute('identifierName', tagInfo.ident_name); tagExpr.setAttribute('identifierType', 'value');
                 const idValue = xmlDoc.createElement('identifierValue'); idValue.textContent = tagInfo.qual_value;
                 tagExpr.appendChild(idValue); groupingExpr.appendChild(tagExpr); tagList.appendChild(groupingExpr); newTagLists.appendChild(tagList); }); });
    }
    const namespacesNode = xmlProfileNode.querySelector(':scope > Namespaces');
    if (namespacesNode && namespacesNode.nextSibling) { xmlProfileNode.insertBefore(newTagLists, namespacesNode.nextSibling); }
    else if (namespacesNode) { xmlProfileNode.appendChild(newTagLists); }
    else { const dataElementsForInsert = xmlProfileNode.querySelector(':scope > DataElements'); if (dataElementsForInsert && dataElementsForInsert.nextSibling){ xmlProfileNode.insertBefore(newTagLists, dataElementsForInsert.nextSibling); } else if (dataElementsForInsert) { xmlProfileNode.appendChild(newTagLists); } else { xmlProfileNode.appendChild(newTagLists); } }
    const serializer = new XMLSerializer(); const modifiedXmlString = serializer.serializeToString(xmlDoc);
    return modifiedXmlString;
}


function generateTagListsAndRenameElements(xmlDoc) {
    console.log("Renaming elements based on comments...");
    const xmlProfileNode = xmlDoc.querySelector('XMLProfile');
    if (!xmlProfileNode) throw new Error("Cannot find XMLProfile element.");
    const dataElementsNode = xmlProfileNode.querySelector(':scope > DataElements');
    if (!dataElementsNode) {
         console.warn("No DataElements found in XML Profile. Skipping rename.");
    } else {
        const allXmlElements = dataElementsNode.querySelectorAll('XMLElement');
        console.log(`Found ${allXmlElements.length} XMLElements to check for renaming.`);

        allXmlElements.forEach(elementNode => {
            const currentName = elementNode.getAttribute('name');
            const comments = elementNode.getAttribute('comments');

            if (currentName && comments && comments.trim() !== '') {
                const snakeCaseComment = toSnakeCase(comments);
                if (snakeCaseComment) {
                    const newName = `${currentName}_${snakeCaseComment}`;
                    console.log(`Renaming "${currentName}" to "${newName}"`);
                    elementNode.setAttribute('name', newName);
                }
            }
        });
        console.log("Element renaming complete.");
    }

    console.log("Proceeding with TagList generation on renamed profile...");
    return generateTagListsForXmlProfile(xmlDoc);
}

function parseBoomiEdiXmlForPreview(xmlDoc) {
    const lines = [];
    function walkLoop(loopNode, depth = 0) {
         const indent = '  '.repeat(depth);
         const loopName = cleanName(loopNode.getAttribute('name') || 'Loop');
         const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
         const loopingOption = loopNode.getAttribute('loopingOption') || 'unique';
         lines.push(`${indent}<${loopName} repeat="${loopRepeat}" option="${loopingOption}">`);
         const children = Array.from(loopNode.children);
         let previousSegmentName = ''; let segmentCount = 0;
         children.forEach(child => {
             if (child.tagName === 'EdiSegment') {
                 const seg = child;
                 const rawSegName = seg.getAttribute('name') || 'Segment';
                 let segName = cleanName(rawSegName);
                  const maxUse = seg.getAttribute('maxUse') || '1';
                  const mandatory = seg.getAttribute('mandatory') === 'true';
                  if (segName === previousSegmentName) { segmentCount++; segName = `${segName}_${segmentCount}`; } else { segmentCount = 0; }
                  previousSegmentName = segName;
                  lines.push(`${indent}  <${segName} maxUse="${maxUse}" mandatory="${mandatory}">`);
                  seg.querySelectorAll(':scope > EdiDataElement').forEach(el => {
                      const elName = el.getAttribute('name') || 'Element'; const elType = el.getAttribute('dataType') || 'string';
                      const finalName = cleanName(elName);
                      lines.push(`${indent}    <${finalName} type="${elType}" />`); });
                  lines.push(`${indent}  </${segName}>`);
             } else if (child.tagName === 'EdiLoop') {
                 walkLoop(child, depth + 1); previousSegmentName = ''; segmentCount = 0; } });
         lines.push(`${indent}</${loopName}>`);
    }
    const dataElementsNode = xmlDoc.querySelector('EdiProfile > DataElements');
    if (dataElementsNode) { dataElementsNode.querySelectorAll(':scope > EdiLoop').forEach(loop => walkLoop(loop)); }
    else { lines.push("Preview Error: Could not find <DataElements>."); }
    return lines.join('\n');
}

function parseBoomiXmlProfileForPreview(xmlDoc) {
    const lines = [];
    function walkElement(elementNode, depth = 0) {
         const indent = '  '.repeat(depth);
         const elName = cleanName(elementNode.getAttribute('name') || 'Element');
         const maxOccurs = elementNode.getAttribute('maxOccurs') || '1';
         const minOccurs = elementNode.getAttribute('minOccurs') || '1';
         const looping = elementNode.getAttribute('loopingOption') === 'unique' ? ' (Looping)' : '';
         const qualifiers = elementNode.querySelectorAll(':scope > QualifierList > Qualifier');
         let qualifierText = '';
         if (qualifiers.length > 0) { qualifierText = ' Qualifiers: [' + Array.from(qualifiers).map(q => q.getAttribute('qualifierValue')).join(', ') + ']'; }
         lines.push(`${indent}<${elName}${looping} minOccurs="${minOccurs}" maxOccurs="${maxOccurs}"${qualifierText}>`);
         elementNode.querySelectorAll(':scope > XMLElement').forEach(child => walkElement(child, depth + 1));
    }
    const dataElementsNode = xmlDoc.querySelector('XMLProfile > DataElements');
    if (dataElementsNode) { dataElementsNode.querySelectorAll(':scope > XMLElement').forEach(rootEl => walkElement(rootEl)); }
    else { lines.push("Preview Error: Could not find <DataElements>."); }
    return lines.join('\n');
}