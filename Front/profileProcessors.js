// === Helper Functions ===

function toSnakeCase(str) {
    if (!str) return '';
    return str.trim()
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/__+/g, '_')
        .toLowerCase();
}

function cleanName(name) {
    if (!name) return 'UnnamedElement';
    let cleaned = name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (/^[\d\-]/.test(cleaned)) cleaned = `_${cleaned}`;
    if (cleaned.toLowerCase().startsWith('xml')) cleaned = `_${cleaned}`;
    if (!cleaned) return 'EmptyElementName';
    return cleaned;
}

// === XSD Generation Logic ===

function mapTypeXsd(ediType) {
     switch (ediType ? ediType.toUpperCase() : '') {
        case 'ID': case 'AN': return 'xs:string';
        case 'R': return 'xs:string'; // Could be xs:decimal
        case 'N0': case 'N1': case 'N2': case 'N3': case 'N4':
        case 'N5': case 'N6': case 'N7': case 'N8': case 'N9': return 'xs:string'; // Could be xs:decimal/integer
        case 'DT': return 'xs:string'; // Could be xs:date
        case 'TM': return 'xs:string'; // Could be xs:time
        default: return 'xs:string';
     }
}

function generateXsd(xmlDoc) {
    if (!xmlDoc || !xmlDoc.querySelector('EdiProfile')) {
        console.error("generateXsd called with invalid or non-EDI profile document.");
        return "";
    }

    let xsdParts = [];
    xsdParts.push(`<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n`);
    const profileName = xmlDoc.documentElement.getAttribute('name');
    const rootElementName = profileName ? cleanName(profileName) : 'EdiDocument';
    xsdParts.push(`${'  '.repeat(1)}<xs:element name="${rootElementName}">\n`);
    xsdParts.push(`${'  '.repeat(2)}<xs:complexType>\n`);
    xsdParts.push(`${'  '.repeat(3)}<xs:sequence>\n`);

    function walkLoopXsd(loopNode, depth = 3) {
        const loopKey = loopNode.getAttribute('key');
        const rawLoopName = loopNode.getAttribute('name') || 'Loop';
        const loopName = cleanName(rawLoopName);

        const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
        const mandatory = loopNode.getAttribute('mandatory') === 'true';
        const minOccurs = mandatory ? '1' : '0';
        const maxOccurs = loopRepeat === '-1' ? 'unbounded' : loopRepeat;

        xsdParts.push(`${'  '.repeat(depth)}<xs:element name="${loopName}" minOccurs="${minOccurs}" maxOccurs="${maxOccurs}">\n`);

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
                    const xsdType = mapTypeXsd(elType);

                    let annotationString = '';
                    if (elPurpose) {
                         const escapedPurpose = elPurpose.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                         annotationString = `${'  '.repeat(depth + 6)}<xs:annotation>\n${'  '.repeat(depth + 7)}<xs:documentation>${escapedPurpose}</xs:documentation>\n${'  '.repeat(depth + 6)}</xs:annotation>\n`;
                     }

                    const minLength = el.getAttribute('minLength');
                    const maxLength = el.getAttribute('maxLength');
                    const qualifierNodes = el.querySelectorAll(':scope > QualifierList > Qualifier');
                    let enumerations = '';

                    if (qualifierNodes.length > 0) {
                        qualifierNodes.forEach(qNode => {
                            const qVal = qNode.getAttribute('qualifierValue');
                            if (qVal) {
                                const escapedQVal = qVal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                enumerations += `${'  '.repeat(depth + 9)}<xs:enumeration value="${escapedQVal}"/>\n`;
                            }
                        });
                    } else {
                        const codeListAttr = el.querySelector(':scope > QualifierList')?.getAttribute('codeList');
                        if (codeListAttr) {
                            enumerations += `${'  '.repeat(depth + 9)}\n`;
                        }
                    }

                    const hasRestrictions = minLength || maxLength || (enumerations.trim() !== '');

                    if (hasRestrictions) {
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
                walkLoopXsd(child, depth + 3);
                segmentNameCounts = {};
            }
        });

        xsdParts.push(`${'  '.repeat(depth + 2)}</xs:sequence>\n`);
        xsdParts.push(`${'  '.repeat(depth + 1)}</xs:complexType>\n`);
        xsdParts.push(`${'  '.repeat(depth)}</xs:element>\n`);
    }

    const dataElementsNode = xmlDoc.querySelector('EdiProfile > DataElements');
    if (dataElementsNode) {
         dataElementsNode.querySelectorAll(':scope > EdiLoop').forEach(loop => walkLoopXsd(loop, 3));
    } else {
         console.error("Could not find <DataElements> in EDI Profile.");
         xsdParts.push(`\n`);
    }

    xsdParts.push(`${'  '.repeat(3)}</xs:sequence>\n`);
    xsdParts.push(`${'  '.repeat(2)}</xs:complexType>\n`);
    xsdParts.push(`${'  '.repeat(1)}</xs:element>\n`);
    xsdParts.push(`</xs:schema>\n`);

    return xsdParts.join('');
}

/**
 * Removes minLength and maxLength restrictions from an XSD string.
 * @param {string} xsdString - The XSD schema content as a string.
 * @returns {string|null} The modified XSD string, or null if parsing fails.
 */
function removeLengthRestrictionsFromXsd(xsdString) { // Renamed back
    if (!xsdString || !xsdString.trim().startsWith('<')) {
        console.warn("removeLengthRestrictionsFromXsd called with non-XML string.");
        return xsdString; // Return original if not XML
    }

    console.log("Attempting to remove length restrictions from XSD...");
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xsdString, "application/xml");
    const parserError = xmlDoc.querySelector('parsererror');

    if (parserError) {
        console.error("Error parsing XSD for length removal:", parserError.textContent);
        throw new Error("Could not parse the XSD content in the output area.");
    }

    const minLengthNodes = xmlDoc.querySelectorAll("xs\\:minLength, minLength");
    const maxLengthNodes = xmlDoc.querySelectorAll("xs\\:maxLength, maxLength");
    let removedCount = 0;

    console.log(`Found ${minLengthNodes.length} minLength nodes.`);
    minLengthNodes.forEach(node => {
        if (node.namespaceURI === "http://www.w3.org/2001/XMLSchema") {
            console.log(`  Removing node: ${node.tagName} with value ${node.getAttribute('value')}`);
            node.remove();
            removedCount++;
        } else { console.log(`  Skipping node (wrong namespace): ${node.tagName}`); }
    });

    console.log(`Found ${maxLengthNodes.length} maxLength nodes.`);
    maxLengthNodes.forEach(node => {
         if (node.namespaceURI === "http://www.w3.org/2001/XMLSchema") {
            console.log(`  Removing node: ${node.tagName} with value ${node.getAttribute('value')}`);
            node.remove();
            removedCount++;
         } else { console.log(`  Skipping node (wrong namespace): ${node.tagName}`); }
    });
    console.log(`Removed ${removedCount} length restriction elements from XSD.`);

    const serializer = new XMLSerializer();
    const modifiedXsdString = serializer.serializeToString(xmlDoc);
    return modifiedXsdString;
}


// === JSON Schema Generation Logic (REMOVED) ===
// function mapTypeJson(ediType) { ... }
// function generateJsonSchema(xmlDoc) { ... }


// === XML Profile Processing Logic ===

function findLoopingAncestorJs(elementNode) {
    const qualifyingElementKey = elementNode.getAttribute('key');
    const qualifyingElementName = elementNode.getAttribute('name');
    console.log(`Finding looping ancestor for qualifying element: key=${qualifyingElementKey} name=${qualifyingElementName}`);
    const segmentElement = elementNode.parentElement;
    if (!segmentElement || segmentElement.tagName !== 'XMLElement') { console.warn(`Could not find parent XMLElement for key=${qualifyingElementKey}.`); return null; }
    const segmentKey = segmentElement.getAttribute('key');
    const segmentName = segmentElement.getAttribute('name');
    console.log(`  Direct parent (segment): key=${segmentKey} name=${segmentName}`);
    const potentialLoopElement = segmentElement.parentElement;
    if (!potentialLoopElement || potentialLoopElement.tagName !== 'XMLElement') {
         const segmentLoopingOption = segmentElement.getAttribute('loopingOption');
         if (segmentLoopingOption === 'unique') { console.log(`    Confirmed looping ancestor IS the segment element: key=${segmentKey} name=${segmentName}`); return segmentElement; }
         console.warn(`Could not find parent XMLElement for segment key=${segmentKey}, and segment itself is not looping.`); return null;
    }
    const loopKey = potentialLoopElement.getAttribute('key');
    const loopName = potentialLoopElement.getAttribute('name');
    const loopingOption = potentialLoopElement.getAttribute('loopingOption');
    console.log(`  Parent of segment (potential loop): key=${loopKey} name=${loopName} loopingOption=${loopingOption}`);
    if (loopingOption === 'unique') { console.log(`    Confirmed looping ancestor: key=${loopKey} name=${loopName}`); return potentialLoopElement; }
    else {
        const segmentLoopingOption = segmentElement.getAttribute('loopingOption');
         if (segmentLoopingOption === 'unique') { console.log(`    Confirmed looping ancestor IS the segment element: key=${segmentKey} name=${segmentName}`); return segmentElement; }
        console.warn(`  Parent of segment (key=${loopKey}) is not the intended looping container (loopingOption=${loopingOption}), and segment (key=${segmentKey}) is not looping either. Cannot determine correct ancestor for TagList.`); return null;
    }
}

function generateTagListsForXmlProfile(xmlDoc) {
    console.log("Analyzing XML profile for qualifiers to generate TagLists...");
    const xmlProfileNode = xmlDoc.querySelector('XMLProfile');
    if (!xmlProfileNode) throw new Error("Cannot find XMLProfile element.");
    const dataElementsNode = xmlProfileNode.querySelector(':scope > DataElements');
    if (!dataElementsNode) { console.warn("No DataElements found in XML Profile. Cannot generate tags."); return new XMLSerializer().serializeToString(xmlDoc); }
    const tagsToGenerate = new Map();
    const allElements = dataElementsNode.querySelectorAll('XMLElement');
    console.log(`Found ${allElements.length} XMLElement(s) to scan for qualifiers.`);
    allElements.forEach(elementNode => {
        const qualifierList = elementNode.querySelector(':scope > QualifierList');
        if (qualifierList) {
            const explicitQualifiers = qualifierList.querySelectorAll(':scope > Qualifier[qualifierValue]');
            if (explicitQualifiers.length > 0) {
                 const qualValues = Array.from(explicitQualifiers).map(q => q.getAttribute('qualifierValue')).filter(val => val);
                 if (qualValues.length > 0) {
                     const qualifyingElementKey = elementNode.getAttribute('key');
                     const qualifyingElementName = elementNode.getAttribute('name');
                     if (!qualifyingElementKey || !qualifyingElementName) { console.warn("Skipping element with qualifiers but missing key/name:", elementNode.outerHTML); return; }
                     const containerNode = findLoopingAncestorJs(elementNode);
                     if (containerNode) {
                         const containerKey = containerNode.getAttribute('key');
                         if (containerKey) {
                             console.log(`Found qualifiers [${qualValues.join(',')}] on element key=${qualifyingElementKey} (${qualifyingElementName}) belonging to container key=${containerKey} (${containerNode.getAttribute('name')})`);
                             if (!tagsToGenerate.has(containerKey)) tagsToGenerate.set(containerKey, []);
                             const containerTags = tagsToGenerate.get(containerKey);
                             const uniqueSortedQuals = [...new Set(qualValues)].sort();
                             uniqueSortedQuals.forEach(qVal => {
                                 const exists = containerTags.some(t => t.ident_key === qualifyingElementKey && t.qual_value === qVal);
                                 if (!exists) containerTags.push({ ident_key: qualifyingElementKey, ident_name: qualifyingElementName, qual_value: qVal });
                             });
                         } else { console.warn(`Container node ${containerNode.getAttribute('name')} found for element key=${qualifyingElementKey} but container has no key.`); }
                     } else { console.warn(`Could not find looping ancestor container for element key=${qualifyingElementKey}. TagLists might be incorrect.`); }
                 }
            }
        }
    });
    let existingTagLists = xmlProfileNode.querySelector(':scope > tagLists');
    if (existingTagLists) { console.log("Removing existing <tagLists> element."); xmlProfileNode.removeChild(existingTagLists); }
    const newTagLists = xmlDoc.createElement('tagLists');
    if (tagsToGenerate.size === 0) { console.log("No qualifying elements found to generate TagLists. Adding empty <tagLists>."); }
    else {
        console.log(`Generating ${Array.from(tagsToGenerate.values()).flat().length} TagList entries.`);
        let listKeyCounter = 1;
        const sortedContainerKeys = [...tagsToGenerate.keys()].sort((a, b) => parseInt(a) - parseInt(b));
        sortedContainerKeys.forEach(containerKey => {
             const tags = tagsToGenerate.get(containerKey);
             tags.sort((a, b) => { const keyCompare = parseInt(a.ident_key) - parseInt(b.ident_key); if (keyCompare !== 0) return keyCompare; return a.qual_value.localeCompare(b.qual_value); });
             tags.forEach(tagInfo => {
                 const tagList = xmlDoc.createElement('TagList');
                 tagList.setAttribute('elementKey', containerKey);
                 tagList.setAttribute('listKey', listKeyCounter.toString()); listKeyCounter++;
                 const groupingExpr = xmlDoc.createElement('GroupingExpression'); groupingExpr.setAttribute('operator', 'and');
                 const tagExpr = xmlDoc.createElement('TagExpression');
                 tagExpr.setAttribute('identifierKey', tagInfo.ident_key);
                 tagExpr.setAttribute('identifierName', tagInfo.ident_name);
                 tagExpr.setAttribute('identifierType', 'value');
                 const idValue = xmlDoc.createElement('identifierValue'); idValue.textContent = tagInfo.qual_value;
                 tagExpr.appendChild(idValue); groupingExpr.appendChild(tagExpr); tagList.appendChild(groupingExpr); newTagLists.appendChild(tagList);
             });
        });
    }
    const namespacesNode = xmlProfileNode.querySelector(':scope > Namespaces');
    if (namespacesNode && namespacesNode.nextSibling) { xmlProfileNode.insertBefore(newTagLists, namespacesNode.nextSibling); }
    else if (namespacesNode) { xmlProfileNode.appendChild(newTagLists); }
    else { const dataElementsForInsert = xmlProfileNode.querySelector(':scope > DataElements'); if (dataElementsForInsert && dataElementsForInsert.nextSibling){ xmlProfileNode.insertBefore(newTagLists, dataElementsForInsert.nextSibling); } else if (dataElementsForInsert) { xmlProfileNode.appendChild(newTagLists); } else { xmlProfileNode.appendChild(newTagLists); } }
    const serializer = new XMLSerializer(); const modifiedXmlString = serializer.serializeToString(xmlDoc); return modifiedXmlString;
}

// --- Renaming Logic ---

function _performRenameOnDoc(xmlDoc) {
    const xmlProfileNode = xmlDoc.querySelector('XMLProfile');
    if (!xmlProfileNode) throw new Error("Cannot find XMLProfile element for renaming.");
    const dataElementsNode = xmlProfileNode.querySelector(':scope > DataElements');
    if (!dataElementsNode) { console.warn("No DataElements found in XML Profile. Skipping rename phase."); return; }
    const allXmlElements = dataElementsNode.querySelectorAll('XMLElement');
    console.log(`Found ${allXmlElements.length} XMLElements to check for renaming.`);
    let renameCount = 0;
    allXmlElements.forEach(elementNode => {
        const currentName = elementNode.getAttribute('name');
        const comments = elementNode.getAttribute('comments');
        if (currentName && comments && comments.trim() !== '') {
            const snakeCaseComment = toSnakeCase(comments);
            if (snakeCaseComment) {
                const newName = `${currentName}_${snakeCaseComment}`;
                if (newName !== currentName) { console.log(`Renaming "${currentName}" to "${newName}" based on comment.`); elementNode.setAttribute('name', newName); renameCount++; }
            }
        }
    });
    console.log(`Element renaming based on comments complete. Renamed ${renameCount} elements.`);
}

function renameElementsOnly(xmlDoc) {
    console.log("Starting renameElementsOnly function...");
    _performRenameOnDoc(xmlDoc);
    const serializer = new XMLSerializer(); const modifiedXmlString = serializer.serializeToString(xmlDoc);
    console.log("Finished renameElementsOnly function."); return modifiedXmlString;
}

function generateTagListsAndRenameElements(xmlDoc) {
    console.log("Starting generateTagListsAndRenameElements function...");
    _performRenameOnDoc(xmlDoc);
    const finalXmlString = generateTagListsForXmlProfile(xmlDoc);
    console.log("Finished generateTagListsAndRenameElements function."); return finalXmlString;
}

// --- Preview Functions ---

function parseBoomiEdiXmlForPreview(xmlDoc) {
    const lines = [];
    function walkLoop(loopNode, depth = 0) {
         const indent = '  '.repeat(depth);
         const loopName = cleanName(loopNode.getAttribute('name') || 'Loop');
         const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
         const loopingOption = loopNode.getAttribute('loopingOption') || 'unique';
         const maxOccurs = loopRepeat === '-1' ? 'unbounded' : loopRepeat;
         lines.push(`${indent}<${loopName} maxOccurs="${maxOccurs}" option="${loopingOption}">`);
         const children = Array.from(loopNode.children);
         let previousSegmentName = ''; let segmentCount = 0;
         children.forEach(child => {
             if (child.tagName === 'EdiSegment') {
                 const seg = child;
                 const rawSegName = seg.getAttribute('name') || 'Segment';
                 let segName = cleanName(rawSegName);
                  const maxUse = seg.getAttribute('maxUse') || '1';
                  const mandatory = seg.getAttribute('mandatory') === 'true';
                  const segMaxOccurs = maxUse === '-1' ? 'unbounded' : maxUse;
                  if (segName === previousSegmentName) { segmentCount++; segName = `${segName}_${segmentCount}`; } else { segmentCount = 0; }
                  previousSegmentName = segName;
                  lines.push(`${indent}  <${segName} maxOccurs="${segMaxOccurs}" mandatory="${mandatory}">`);
                  seg.querySelectorAll(':scope > EdiDataElement').forEach(el => {
                      const elName = el.getAttribute('name') || 'Element';
                      const elType = el.getAttribute('dataType') || 'string';
                      const finalName = cleanName(elName);
                      lines.push(`${indent}    <${finalName} type="${elType}" />`);
                  });
                  lines.push(`${indent}  </${segName}>`);
             } else if (child.tagName === 'EdiLoop') {
                 walkLoop(child, depth + 1);
                 previousSegmentName = ''; segmentCount = 0;
             }
         });
         lines.push(`${indent}</${loopName}>`);
    }
    const dataElementsNode = xmlDoc.querySelector('EdiProfile > DataElements');
    if (dataElementsNode) { dataElementsNode.querySelectorAll(':scope > EdiLoop').forEach(loop => walkLoop(loop)); }
    else { lines.push("Preview Error: Could not find <DataElements> in EDI Profile."); }
    return lines.join('\n');
}

function parseBoomiXmlProfileForPreview(xmlDoc) {
    const lines = [];
    function walkElement(elementNode, depth = 0) {
         const indent = '  '.repeat(depth);
         const elName = cleanName(elementNode.getAttribute('name') || 'Element');
         const maxOccursAttr = elementNode.getAttribute('maxOccurs') || '1';
         const minOccurs = elementNode.getAttribute('minOccurs') || '1';
         const maxOccurs = maxOccursAttr === '-1' ? 'unbounded' : maxOccursAttr;
         const looping = elementNode.getAttribute('loopingOption') === 'unique' ? ' (Looping)' : '';
         const qualifiers = elementNode.querySelectorAll(':scope > QualifierList > Qualifier');
         let qualifierText = '';
         if (qualifiers.length > 0) {
             const qualValues = Array.from(qualifiers).map(q => q.getAttribute('qualifierValue')).filter(v => v);
             if (qualValues.length > 0) { qualifierText = ' Qualifiers: [' + qualValues.join(', ') + ']'; }
         }
         lines.push(`${indent}<${elName}${looping} minOccurs="${minOccurs}" maxOccurs="${maxOccurs}"${qualifierText}>`);
         elementNode.querySelectorAll(':scope > XMLElement').forEach(child => walkElement(child, depth + 1));
    }
    const dataElementsNode = xmlDoc.querySelector('XMLProfile > DataElements');
    if (dataElementsNode) { dataElementsNode.querySelectorAll(':scope > XMLElement').forEach(rootEl => walkElement(rootEl)); }
    else { lines.push("Preview Error: Could not find <DataElements> in XML Profile."); }
    return lines.join('\n');
}
