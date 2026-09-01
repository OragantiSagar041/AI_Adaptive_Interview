const fs = require('fs');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace col-span numbers to balance the layout
    content = content.replace(/lg:col-span-7/g, 'lg:col-span-6');
    content = content.replace(/lg:col-span-5/g, 'lg:col-span-6');
    // Also update comments for consistency (optional)
    content = content.replace(/Col Span 7/g, 'Col Span 6');
    content = content.replace(/Col Span 5/g, 'Col Span 6');
    
    const card5Start = content.indexOf('{/* Card 5: Excel/CSV Upload Dropzone */}');
    const actionControlsStart = content.indexOf('{/* Form Action Controls (Bulk) */}');
    
    if (card5Start !== -1 && actionControlsStart !== -1) {
        const cardsText = content.substring(card5Start, actionControlsStart);
        content = content.substring(0, card5Start) + content.substring(actionControlsStart);
        
        const rightColumnStart = content.indexOf('{/* Right Column: Settings, Candidates & Submission');
        if (rightColumnStart !== -1) {
            const beforeRightColumn = content.substring(0, rightColumnStart);
            // Search backwards for the closing div of the left column
            // We want the last non-whitespace string '</div>' before the right column comment.
            // Let's use a regex to match the padding spaces and </div> right before the right column comment.
            const match = beforeRightColumn.match(/(\s*<\/div>\s*)$/);
            if (match) {
                const lastDivIndex = beforeRightColumn.lastIndexOf(match[1]);
                // Insert the cards before that </div>
                content = content.substring(0, lastDivIndex) + '\n' + cardsText.trimRight() + '\n' + content.substring(lastDivIndex);
                fs.writeFileSync(filePath, content);
                console.log('Successfully updated ' + filePath);
                return;
            }
        }
    }
    console.log('Could not process completely: ' + filePath);
}

processFile('c:/Users/pottabathini meghana/Downloads/AI_Adaptive_Interview/Front-end/src/pages/superadmin/CreateInterviewPage.jsx');
processFile('c:/Users/pottabathini meghana/Downloads/AI_Adaptive_Interview/Front-end/src/pages/admin/CreateInterviewPage.jsx');
