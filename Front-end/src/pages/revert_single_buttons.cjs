const fs = require('fs');

function revertSingleButtons(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    const singleActionStart = content.indexOf('{/* Form Action Controls */}');
    if (singleActionStart !== -1) {
        let singleActionEnd = content.indexOf('</div>', content.indexOf('</Button>', content.indexOf('</Button>', singleActionStart) + 1));
        singleActionEnd += 6; // include '</div>'
        
        const singleActionBlock = content.substring(singleActionStart, singleActionEnd);
        
        // Remove from current position
        // Also remove any leading empty lines or spaces that might have been added
        const startToRemove = content.lastIndexOf('\n', singleActionStart - 1);
        content = content.substring(0, startToRemove > 0 ? startToRemove : singleActionStart) + content.substring(singleActionEnd);
        
        // Find where to insert it: after the </Card> inside the single tab's right column.
        const bulkPanelStart = content.indexOf('{/* Bulk send panel */}');
        if (bulkPanelStart !== -1) {
            const beforeBulk = content.substring(0, bulkPanelStart);
            // find the last </Card> before bulkPanelStart
            const lastCardIndex = beforeBulk.lastIndexOf('</Card>');
            if (lastCardIndex !== -1) {
                // Insert after </Card>
                const insertIndex = lastCardIndex + '</Card>'.length;
                content = content.substring(0, insertIndex) + '\n\n              ' + singleActionBlock + content.substring(insertIndex);
            }
        }
    }

    fs.writeFileSync(filePath, content);
    console.log('Successfully reverted single buttons in ' + filePath);
}

revertSingleButtons('c:/Users/pottabathini meghana/Downloads/AI_Adaptive_Interview/Front-end/src/pages/superadmin/CreateInterviewPage.jsx');
revertSingleButtons('c:/Users/pottabathini meghana/Downloads/AI_Adaptive_Interview/Front-end/src/pages/admin/CreateInterviewPage.jsx');
