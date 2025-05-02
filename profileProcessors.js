function toSnakeCase(str) {
    // Converts a string to snake_case.
    if (!str) return '';
    return str.trim()
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove non-alphanumeric/space chars
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/__+/g, '_')          // Replace multiple underscores with one
        .toLowerCase();
}

function cleanName(name) {
    // Cleans a name for use in XML/XSD elements.
    // Removes invalid characters, prefixes with underscore if starts with digit/dash or 'xml'.
    if (!name) return 'UnnamedElement';
    let cleaned = name.replace(/[^a-zA-Z0-9_\-]/g, '_'); // Allow letters, numbers, underscore, hyphen
    // XML element names cannot start with digits or hyphens, or 'xml' (case-insensitive)
    if (/^[\d\-]/.test(cleaned)) cleaned = `_${cleaned}`;
    if (cleaned.toLowerCase().startsWith('xml')) cleaned = `_${cleaned}`;
    if (!cleaned) return 'EmptyElementName'; // Handle cases where name becomes empty
    return cleaned;
}

function mapType(ediType) {
    // Maps EDI data types to basic XSD types (simplified for this tool).
     switch (ediType ? ediType.toUpperCase() : '') {
        case 'ID': // Identifier
        case 'AN': // Alphanumeric String
            return 'xs:string';
        case 'R':  // Decimal Number
            return 'xs:string'; // Representing as string for simplicity, could be xs:decimal
        case 'N0': // Numeric (Implied Decimal 0)
        case 'N1': // Numeric (Implied Decimal 1)
        case 'N2': // Numeric (Implied Decimal 2)
        // ... up to N9
        case 'N3': case 'N4': case 'N5':
        case 'N6': case 'N7': case 'N8': case 'N9':
            return 'xs:string'; // Representing as string, could be xs:decimal/integer
        case 'DT': // Date
            return 'xs:string'; // Could be xs:date with pattern
        case 'TM': // Time
            return 'xs:string'; // Could be xs:time with pattern
        default:   // Default fallback
            return 'xs:string';
     }
}

function parseTagLists(xmlDoc) {
    // Parses existing <TagList> definitions from an EDI profile XML.
    // Returns a Map where keys are elementKey (loop key) and values are arrays of documentation strings.
    // This function is still needed if you *ever* want to add the annotations back,
    // but its result is no longer used by generateXsd in this version.
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
    // Generates an XSD schema string from a Boomi EDI Profile XML DOM.
    if (window.profileType !== 'EDI') {
        console.error("generateXsd called with non-EDI profile type.");
        return "";
    }

    let xsdParts = [];
    xsdParts.push(`<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n`);
    const profileName = xmlDoc.documentElement.getAttribute('name');
    const rootElementName = profileName ? cleanName(profileName) : 'EdiDocument';
    xsdParts.push(`${'  '.repeat(1)}<xs:element name="${rootElementName}">\n`);
    xsdParts.push(`${'  '.repeat(2)}<xs:complexType>\n`);
    xsdParts.push(`${'  '.repeat(3)}<xs:sequence>\n`);

    // *** Removed the call to parseTagLists here as its result is no longer used ***
    // const tagDocumentation = parseTagLists(xmlDoc);

    function walkLoop(loopNode, depth = 3) {
        const loopKey = loopNode.getAttribute('key');
        const rawLoopName = loopNode.getAttribute('name') || 'Loop';
        const loopName = cleanName(rawLoopName);

        const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
        const mandatory = loopNode.getAttribute('mandatory') === 'true';
        const minOccurs = mandatory ? '1' : '0';
        const maxOccurs = loopRepeat === '-1' ? 'unbounded' : loopRepeat;

        xsdParts.push(`${'  '.repeat(depth)}<xs:element name="${loopName}" minOccurs="${minOccurs}" maxOccurs="${maxOccurs}">\n`);

        // *** REMOVED ANNOTATION BLOCK FOR TAGLISTS ***
        /*
        if (loopKey && tagDocumentation.has(loopKey)) {
            xsdParts.push(`${'  '.repeat(depth + 1)}<xs:annotation>\n`);
            tagDocumentation.get(loopKey).forEach(doc => {
                const escapedDoc = doc.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                xsdParts.push(`${'  '.repeat(depth + 2)}<xs:documentation>${escapedDoc}</xs:documentation>\n`);
            });
            xsdParts.push(`${'  '.repeat(depth + 1)}</xs:annotation>\n`);
        }
        */
        // *** END OF REMOVED BLOCK ***

        xsdParts.push(`${'  '.repeat(depth + 1)}<xs:complexType>\n`);
        xsdParts.push(`${'  '.repeat(depth + 2)}<xs:sequence>\n`);

        const children = Array.from(loopNode.children);
        let segmentNameCounts = {};

        children.forEach(child => {
            if (child.tagName === 'EdiSegment') {
                const seg = child;
                const rawSegName = seg.getAttribute('name') || 'Segment';
                const segPurpose = seg.getAttribute('segmentName'); // Keep segment purpose annotation

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

                // Keep segment purpose annotation
                let segAnnotationString = '';
                 if (segPurpose) {
                     const escapedPurpose = segPurpose.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                     segAnnotationString = `${'  '.repeat(depth + 4)}<xs:annotation>\n${'  '.repeat(depth + 5)}<xs:documentation>Segment: ${escapedPurpose}</xs:documentation>\n${'  '.repeat(depth + 4)}</xs:annotation>\n`;
                 }

                xsdParts.push(`${'  '.repeat(depth + 3)}<xs:element name="${finalSegName}" minOccurs="${segMinOccurs}" maxOccurs="${segMaxOccurs}">\n`);
                 xsdParts.push(segAnnotationString); // Add segment annotation
                xsdParts.push(`${'  '.repeat(depth + 4)}<xs:complexType>\n`);
                xsdParts.push(`${'  '.repeat(depth + 5)}<xs:sequence>\n`);

                seg.querySelectorAll(':scope > EdiDataElement').forEach(el => {
                    const elName = el.getAttribute('name') || 'Element';
                    const elPurpose = el.getAttribute('elementPurpose'); // Keep element purpose annotation

                    const elType = el.getAttribute('dataType') || 'string';
                    const elMandatory = el.getAttribute('mandatory') === 'true';
                    const elMinOccurs = elMandatory ? '1' : '0';
                    const elMaxOccurs = '1';
                    const finalName = cleanName(elName);
                    const xsdType = mapType(elType);

                    // Keep element purpose annotation
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
                                 enumerations += `${'  '.repeat(depth + 9)}<xs:enumeration value="${escapedQVal}"/>\n`;
                             }
                         });
                     } else if (includeValidation) {
                         const codeListAttr = el.querySelector(':scope > QualifierList')?.getAttribute('codeList');
                         if (codeListAttr) {
                             enumerations += `${'  '.repeat(depth + 9)}\n`;
                         }
                     }

                    const hasRestrictions = minLength || maxLength || (enumerations.trim() !== '');

                    if (includeValidation && hasRestrictions) {
                         xsdParts.push(`${'  '.repeat(depth + 6)}<xs:element name="${finalName}" minOccurs="${elMinOccurs}" maxOccurs="${elMaxOccurs}">\n`);
                         xsdParts.push(annotationString); // Add element annotation
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
                         xsdParts.push(annotationString); // Add element annotation
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
         console.error("Could not find <DataElements> in EDI Profile.");
         xsdParts.push(`\n`);
    }

    xsdParts.push(`${'  '.repeat(3)}</xs:sequence>\n`);
    xsdParts.push(`${'  '.repeat(2)}</xs:complexType>\n`);
    xsdParts.push(`${'  '.repeat(1)}</xs:element>\n`);
    xsdParts.push(`</xs:schema>\n`);

    return xsdParts.join('');
}

// *** REVISED findLoopingAncestorJs FUNCTION ***
function findLoopingAncestorJs(elementNode) {
    // Finds the intended looping ancestor for instance identification.
    // Assumes the qualifier is on an element within a segment-like structure (e.g., N902 within N9),
    // and the instance identifier should apply to the parent loop of that segment (e.g., _0400).

    const qualifyingElementKey = elementNode.getAttribute('key');
    const qualifyingElementName = elementNode.getAttribute('name');
    console.log(`Finding looping ancestor for qualifying element: key=${qualifyingElementKey} name=${qualifyingElementName}`);

    // 1. Get the direct parent (likely the segment element, e.g., N9)
    const segmentElement = elementNode.parentElement;
    if (!segmentElement || segmentElement.tagName !== 'XMLElement') {
        console.warn(`Could not find parent XMLElement for key=${qualifyingElementKey}.`);
        return null;
    }
    const segmentKey = segmentElement.getAttribute('key');
    const segmentName = segmentElement.getAttribute('name');
    console.log(`  Direct parent (segment): key=${segmentKey} name=${segmentName}`);

    // 2. Get the parent of the segment (the potential loop element, e.g., _0400)
    const potentialLoopElement = segmentElement.parentElement;
    if (!potentialLoopElement || potentialLoopElement.tagName !== 'XMLElement') {
        // If the parent isn't an XMLElement, maybe the 'segment' itself was the loop? Check that.
         const segmentLoopingOption = segmentElement.getAttribute('loopingOption');
         if (segmentLoopingOption === 'unique') {
             console.log(`    Confirmed looping ancestor IS the segment element: key=${segmentKey} name=${segmentName}`);
             return segmentElement;
         }
         console.warn(`Could not find parent XMLElement for segment key=${segmentKey}, and segment itself is not looping.`);
        return null;
    }
    const loopKey = potentialLoopElement.getAttribute('key');
    const loopName = potentialLoopElement.getAttribute('name');
    const loopingOption = potentialLoopElement.getAttribute('loopingOption');
    console.log(`  Parent of segment (potential loop): key=${loopKey} name=${loopName} loopingOption=${loopingOption}`);

    // 3. Check if this potential loop element is indeed the target looping container
    if (loopingOption === 'unique') {
        console.log(`    Confirmed looping ancestor: key=${loopKey} name=${loopName}`);
        return potentialLoopElement;
    } else {
        // If the parent-of-parent is not the loop, check if the segment itself was the loop
        const segmentLoopingOption = segmentElement.getAttribute('loopingOption');
         if (segmentLoopingOption === 'unique') {
             console.log(`    Confirmed looping ancestor IS the segment element: key=${segmentKey} name=${segmentName}`);
             return segmentElement;
         }
        // If neither is the unique loop, log a warning.
        console.warn(`  Parent of segment (key=${loopKey}) is not the intended looping container (loopingOption=${loopingOption}), and segment (key=${segmentKey}) is not looping either. Cannot determine correct ancestor for TagList.`);
        return null;
    }
}


function generateTagListsForXmlProfile(xmlDoc) {
    // Generates <tagLists> section for a Boomi XML Profile based on <QualifierList> definitions.
    console.log("Analyzing XML profile for qualifiers to generate TagLists...");
    const xmlProfileNode = xmlDoc.querySelector('XMLProfile');
    if (!xmlProfileNode) throw new Error("Cannot find XMLProfile element.");

    const dataElementsNode = xmlProfileNode.querySelector(':scope > DataElements');
    if (!dataElementsNode) {
        console.warn("No DataElements found in XML Profile. Cannot generate tags.");
        return new XMLSerializer().serializeToString(xmlDoc);
    }

    // Map to store tag information: { containerKey -> [ {ident_key, ident_name, qual_value}, ... ] }
    const tagsToGenerate = new Map();
    const allElements = dataElementsNode.querySelectorAll('XMLElement'); // Get all XML elements
    console.log(`Found ${allElements.length} XMLElement(s) to scan for qualifiers.`);

    allElements.forEach(elementNode => {
        // Find QualifierList direct child
        const qualifierList = elementNode.querySelector(':scope > QualifierList');
        if (qualifierList) {
            // Find Qualifier children with a qualifierValue attribute
            const explicitQualifiers = qualifierList.querySelectorAll(':scope > Qualifier[qualifierValue]');
            if (explicitQualifiers.length > 0) {
                 // Get all non-empty qualifier values
                 const qualValues = Array.from(explicitQualifiers)
                     .map(q => q.getAttribute('qualifierValue'))
                     .filter(val => val); // Filter out empty/null values

                 if (qualValues.length > 0) {
                     const qualifyingElementKey = elementNode.getAttribute('key');
                     const qualifyingElementName = elementNode.getAttribute('name');

                     // Need key and name of the element with qualifiers
                     if (!qualifyingElementKey || !qualifyingElementName) {
                         console.warn("Skipping element with qualifiers but missing key/name:", elementNode.outerHTML);
                         return; // Skip this element
                     }

                     // *** Use the corrected function to find the parent looping container element ***
                     const containerNode = findLoopingAncestorJs(elementNode);

                     if (containerNode) {
                         const containerKey = containerNode.getAttribute('key');
                         if (containerKey) {
                             console.log(`Found qualifiers [${qualValues.join(',')}] on element key=${qualifyingElementKey} (${qualifyingElementName}) belonging to container key=${containerKey} (${containerNode.getAttribute('name')})`);
                             // Initialize map entry if first time for this container
                             if (!tagsToGenerate.has(containerKey)) {
                                 tagsToGenerate.set(containerKey, []);
                             }
                             const containerTags = tagsToGenerate.get(containerKey);
                             // Get unique, sorted qualifier values
                             const uniqueSortedQuals = [...new Set(qualValues)].sort();

                             // Add tag info for EACH unique qualifier value
                             uniqueSortedQuals.forEach(qVal => {
                                 // Avoid adding duplicates if somehow processed twice
                                 const exists = containerTags.some(t => t.ident_key === qualifyingElementKey && t.qual_value === qVal);
                                 if (!exists) {
                                     containerTags.push({
                                         ident_key: qualifyingElementKey, // Key of the element with the qualifier (e.g., N902)
                                         ident_name: qualifyingElementName, // Name of the element (e.g., N902)
                                         qual_value: qVal // The specific qualifier value (e.g., "BB" or "CC")
                                     });
                                 }
                             });
                         } else {
                             console.warn(`Container node ${containerNode.getAttribute('name')} found for element key=${qualifyingElementKey} but container has no key.`);
                         }
                     } else {
                         console.warn(`Could not find looping ancestor container for element key=${qualifyingElementKey}. TagLists might be incorrect.`);
                     }
                 }
            }
        }
    }); // End scanning elements

    // Remove existing <tagLists> element before adding the new one
    let existingTagLists = xmlProfileNode.querySelector(':scope > tagLists');
    if (existingTagLists) {
        console.log("Removing existing <tagLists> element.");
        xmlProfileNode.removeChild(existingTagLists);
    }

    // Create the new <tagLists> container
    const newTagLists = xmlDoc.createElement('tagLists');

    if (tagsToGenerate.size === 0) {
        console.log("No qualifying elements found to generate TagLists. Adding empty <tagLists>.");
    } else {
        console.log(`Generating ${Array.from(tagsToGenerate.values()).flat().length} TagList entries.`);
        let listKeyCounter = 1; // Counter for unique listKey attributes
        // Sort container keys numerically for consistent output order
        const sortedContainerKeys = [...tagsToGenerate.keys()].sort((a, b) => parseInt(a) - parseInt(b));

        sortedContainerKeys.forEach(containerKey => { // containerKey should now be correct (e.g., 722)
             const tags = tagsToGenerate.get(containerKey);
             // Sort tags within a container first by element key, then by qualifier value
             tags.sort((a, b) => {
                 const keyCompare = parseInt(a.ident_key) - parseInt(b.ident_key);
                 if (keyCompare !== 0) return keyCompare;
                 return a.qual_value.localeCompare(b.qual_value);
             });

             // Create a TagList XML element for EACH tagInfo object
             tags.forEach(tagInfo => {
                 const tagList = xmlDoc.createElement('TagList');
                 // *** Set the elementKey to the CORRECT containerKey found ***
                 tagList.setAttribute('elementKey', containerKey);
                 tagList.setAttribute('listKey', listKeyCounter.toString()); // Assign unique list key
                 listKeyCounter++;

                 const groupingExpr = xmlDoc.createElement('GroupingExpression');
                 groupingExpr.setAttribute('operator', 'and'); // Default operator

                 const tagExpr = xmlDoc.createElement('TagExpression');
                 tagExpr.setAttribute('identifierKey', tagInfo.ident_key); // Key of the element (e.g., N902's key = 727)
                 tagExpr.setAttribute('identifierName', tagInfo.ident_name); // Name of the element (e.g., N902)
                 tagExpr.setAttribute('identifierType', 'value'); // Type is 'value' for qualifier matching

                 const idValue = xmlDoc.createElement('identifierValue');
                 idValue.textContent = tagInfo.qual_value; // The specific qualifier value ("BB" or "CC")

                 // Assemble the TagList structure
                 tagExpr.appendChild(idValue);
                 groupingExpr.appendChild(tagExpr);
                 tagList.appendChild(groupingExpr);
                 newTagLists.appendChild(tagList); // Add the completed TagList to the container
             });
        });
    }

    // Insert the new <tagLists> element into the XML DOM structure.
    const namespacesNode = xmlProfileNode.querySelector(':scope > Namespaces');
    if (namespacesNode && namespacesNode.nextSibling) {
        xmlProfileNode.insertBefore(newTagLists, namespacesNode.nextSibling);
    } else if (namespacesNode) {
        xmlProfileNode.appendChild(newTagLists);
    } else {
        const dataElementsForInsert = xmlProfileNode.querySelector(':scope > DataElements');
        if (dataElementsForInsert && dataElementsForInsert.nextSibling){
            xmlProfileNode.insertBefore(newTagLists, dataElementsForInsert.nextSibling);
        } else if (dataElementsForInsert) {
            xmlProfileNode.appendChild(newTagLists);
        } else {
            xmlProfileNode.appendChild(newTagLists);
        }
    }

    // Serialize the modified XML DOM back to a string
    const serializer = new XMLSerializer();
    const modifiedXmlString = serializer.serializeToString(xmlDoc);
    return modifiedXmlString;
}


function generateTagListsAndRenameElements(xmlDoc) {
    // Renames XML elements based on their 'comments' attribute and then generates TagLists.
    console.log("Renaming elements based on comments attribute...");
    const xmlProfileNode = xmlDoc.querySelector('XMLProfile');
    if (!xmlProfileNode) throw new Error("Cannot find XMLProfile element.");

    const dataElementsNode = xmlProfileNode.querySelector(':scope > DataElements');
    if (!dataElementsNode) {
         console.warn("No DataElements found in XML Profile. Skipping rename phase.");
    } else {
        const allXmlElements = dataElementsNode.querySelectorAll('XMLElement');
        console.log(`Found ${allXmlElements.length} XMLElements to check for renaming.`);

        allXmlElements.forEach(elementNode => {
            const currentName = elementNode.getAttribute('name');
            const comments = elementNode.getAttribute('comments'); // Get comment/description

            // If name and non-empty comments exist...
            if (currentName && comments && comments.trim() !== '') {
                const snakeCaseComment = toSnakeCase(comments); // Convert comment to snake_case
                if (snakeCaseComment) {
                    // Create new name: originalName_snake_case_comment
                    const newName = `${currentName}_${snakeCaseComment}`;
                    console.log(`Renaming "${currentName}" to "${newName}" based on comment.`);
                    elementNode.setAttribute('name', newName); // Update the name attribute
                    // Also update identifierName if generating tags later
                    // elementNode.setAttribute('identifierName', newName); // Let generateTagLists handle identifierName fresh
                }
            }
        });
        console.log("Element renaming based on comments complete.");
    }

    // After renaming, proceed to generate/regenerate the TagLists
    console.log("Proceeding with TagList generation on potentially renamed profile...");
    return generateTagListsForXmlProfile(xmlDoc); // Call the tag generation function
}

// --- Preview Functions ---

function parseBoomiEdiXmlForPreview(xmlDoc) {
    // Generates a simplified text preview of an EDI profile structure.
    const lines = [];
    function walkLoop(loopNode, depth = 0) {
         const indent = '  '.repeat(depth);
         const loopName = cleanName(loopNode.getAttribute('name') || 'Loop');
         const loopRepeat = loopNode.getAttribute('loopRepeat') || '1';
         const loopingOption = loopNode.getAttribute('loopingOption') || 'unique';
         const maxOccurs = loopRepeat === '-1' ? 'unbounded' : loopRepeat;
         lines.push(`${indent}<${loopName} maxOccurs="${maxOccurs}" option="${loopingOption}">`);

         const children = Array.from(loopNode.children);
         let previousSegmentName = ''; let segmentCount = 0; // Basic handling for duplicate segment names

         children.forEach(child => {
             if (child.tagName === 'EdiSegment') {
                 const seg = child;
                 const rawSegName = seg.getAttribute('name') || 'Segment';
                 let segName = cleanName(rawSegName);
                  const maxUse = seg.getAttribute('maxUse') || '1';
                  const mandatory = seg.getAttribute('mandatory') === 'true';
                  const segMaxOccurs = maxUse === '-1' ? 'unbounded' : maxUse;
                  // Simple duplicate handling for preview
                  if (segName === previousSegmentName) { segmentCount++; segName = `${segName}_${segmentCount}`; } else { segmentCount = 0; }
                  previousSegmentName = segName;

                  lines.push(`${indent}  <${segName} maxOccurs="${segMaxOccurs}" mandatory="${mandatory}">`);
                  // Show elements within the segment
                  seg.querySelectorAll(':scope > EdiDataElement').forEach(el => {
                      const elName = el.getAttribute('name') || 'Element';
                      const elType = el.getAttribute('dataType') || 'string';
                      const finalName = cleanName(elName);
                      lines.push(`${indent}    <${finalName} type="${elType}" />`);
                  });
                  lines.push(`${indent}  </${segName}>`);
             } else if (child.tagName === 'EdiLoop') {
                 // Recurse for nested loops
                 walkLoop(child, depth + 1);
                 previousSegmentName = ''; segmentCount = 0; // Reset for new loop scope
             }
         });
         lines.push(`${indent}</${loopName}>`);
    } // End walkLoop

    const dataElementsNode = xmlDoc.querySelector('EdiProfile > DataElements');
    if (dataElementsNode) {
        dataElementsNode.querySelectorAll(':scope > EdiLoop').forEach(loop => walkLoop(loop));
    } else {
        lines.push("Preview Error: Could not find <DataElements> in EDI Profile.");
    }
    return lines.join('\n');
}

function parseBoomiXmlProfileForPreview(xmlDoc) {
    // Generates a simplified text preview of an XML profile structure.
    const lines = [];
    function walkElement(elementNode, depth = 0) {
         const indent = '  '.repeat(depth);
         const elName = cleanName(elementNode.getAttribute('name') || 'Element');
         const maxOccursAttr = elementNode.getAttribute('maxOccurs') || '1';
         const minOccurs = elementNode.getAttribute('minOccurs') || '1';
         // Map Boomi's -1 to unbounded
         const maxOccurs = maxOccursAttr === '-1' ? 'unbounded' : maxOccursAttr;
         const looping = elementNode.getAttribute('loopingOption') === 'unique' ? ' (Looping)' : '';
         // Check for qualifiers to display in preview
         const qualifiers = elementNode.querySelectorAll(':scope > QualifierList > Qualifier');
         let qualifierText = '';
         if (qualifiers.length > 0) {
             const qualValues = Array.from(qualifiers)
                                   .map(q => q.getAttribute('qualifierValue'))
                                   .filter(v => v); // Get non-empty values
             if (qualValues.length > 0) {
                qualifierText = ' Qualifiers: [' + qualValues.join(', ') + ']';
             }
         }
         // Add line for the current element
         lines.push(`${indent}<${elName}${looping} minOccurs="${minOccurs}" maxOccurs="${maxOccurs}"${qualifierText}>`);
         // Recurse for child elements
         elementNode.querySelectorAll(':scope > XMLElement').forEach(child => walkElement(child, depth + 1));
    } // End walkElement

    const dataElementsNode = xmlDoc.querySelector('XMLProfile > DataElements');
    if (dataElementsNode) {
        // Start walking from the root elements defined in DataElements
        dataElementsNode.querySelectorAll(':scope > XMLElement').forEach(rootEl => walkElement(rootEl));
    } else {
        lines.push("Preview Error: Could not find <DataElements> in XML Profile.");
    }
    return lines.join('\n');
}
