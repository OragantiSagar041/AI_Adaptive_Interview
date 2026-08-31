const fs = require('fs');

function moveButtons(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // For Bulk Tab
    const bulkActionStart = content.indexOf('{/* Form Action Controls (Bulk) */}');
    // Find the end of the Form Action Controls div
    // It's followed by </div> </div> )}
    // Let's find the '</div>' after the last Button
    if (bulkActionStart !== -1) {
        let bulkActionEnd = content.indexOf('</div>', content.indexOf('</Button>', content.indexOf('</Button>', bulkActionStart) + 1));
        bulkActionEnd += 6; // include '</div>'
        
        const bulkActionBlock = content.substring(bulkActionStart, bulkActionEnd);
        
        // Remove from current position
        content = content.substring(0, bulkActionStart) + content.substring(bulkActionEnd);
        
        // Insert it right after the Manual Candidates Addition Form block
        // In the previous step, we moved Manual Candidates Addition Form to the left column.
        // It ends with </button> </div> </div>
        const manualFormStart = content.indexOf('{/* Card 6: Manual Candidates Addition Form */}');
        if (manualFormStart !== -1) {
            let manualFormEnd = content.indexOf('</div>', content.indexOf('</button>', manualFormStart));
            // The structure is:
            // <div className="grid...
            //   <Input...
            //   <Input...
            //   <button...
            // </div>
            // </div>
            manualFormEnd = content.indexOf('</div>', manualFormEnd + 1);
            manualFormEnd += 6; // include '</div>'
            
            // Insert bulkActionBlock here
            content = content.substring(0, manualFormEnd) + '\n\n              ' + bulkActionBlock + content.substring(manualFormEnd);
        }
    }

    // For Single Tab (optional, but for consistency if they want it balanced)
    // Actually, in the single tab, the left column has Candidate Info and Material Details.
    // The right column has Settings and Actions.
    // Let's also move `{/* Form Action Controls */}` to the end of the left column.
    const singleActionStart = content.indexOf('{/* Form Action Controls */}');
    if (singleActionStart !== -1) {
        let singleActionEnd = content.indexOf('</div>', content.indexOf('</Button>', content.indexOf('</Button>', singleActionStart) + 1));
        singleActionEnd += 6;
        
        const singleActionBlock = content.substring(singleActionStart, singleActionEnd);
        
        // Remove from current position
        content = content.substring(0, singleActionStart) + content.substring(singleActionEnd);
        
        // Find the end of the left column in the single tab.
        // Left column ends right before {/* Right Column: Settings, Customization & Actions
        const singleRightColStart = content.indexOf('{/* Right Column: Settings, Customization & Actions');
        if (singleRightColStart !== -1) {
            const beforeSingleRightCol = content.substring(0, singleRightColStart);
            const match = beforeSingleRightCol.match(/(\s*<\/div>\s*)$/);
            if (match) {
                const lastDivIndex = beforeSingleRightCol.lastIndexOf(match[1]);
                content = content.substring(0, lastDivIndex) + '\n\n              ' + singleActionBlock + content.substring(lastDivIndex);
            }
        }
    }

    fs.writeFileSync(filePath, content);
    console.log('Successfully updated ' + filePath);
}

moveButtons('c:/Users/pottabathini meghana/Downloads/AI_Adaptive_Interview/Front-end/src/pages/superadmin/CreateInterviewPage.jsx');
moveButtons('c:/Users/pottabathini meghana/Downloads/AI_Adaptive_Interview/Front-end/src/pages/admin/CreateInterviewPage.jsx');
