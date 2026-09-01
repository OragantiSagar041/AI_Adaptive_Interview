const fs = require('fs');

function updateDashboard(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Add handlePipelineStageClick function inside SuperDashboardPage
    const insertPoint = content.indexOf('const navigate = useNavigate();');
    if (insertPoint !== -1 && !content.includes('handlePipelineStageClick')) {
        const insertEnd = insertPoint + 'const navigate = useNavigate();'.length;
        const newFunc = `

  const handlePipelineStageClick = (stageName) => {
    if (!stageName) return;
    const lower = stageName.toLowerCase();
    if (lower.includes("qualified") || lower.includes("hired") || lower.includes("offer") || lower.includes("select")) {
      navigate('/superadmin/qualified-candidates');
    } else if (lower.includes("reject")) {
      navigate('/superadmin/rejected-candidates');
    } else {
      navigate('/superadmin/interviews');
    }
  };
`;
        content = content.substring(0, insertEnd) + newFunc + content.substring(insertEnd);
    }

    // 2. Add onClick to pipeline stage cards and update classes
    if (content.includes('select-none pointer-events-none')) {
        content = content.replace(
            /className="pipeline-stage-card[^"]*select-none pointer-events-none[^"]*"/g,
            'onClick={() => handlePipelineStageClick(p.stage)}\n                   className="pipeline-stage-card rounded-xl p-3.5 text-white text-center shadow-md flex flex-col items-center justify-between min-h-[98px] w-full border border-white/30 dark:border-white/40 ring-1 ring-black/10 dark:ring-white/20 transition-all cursor-pointer hover:scale-[1.03] hover:shadow-lg active:scale-95"'
        );
    }

    // 3. Balance Alignment by adding h-full to the Cards
    content = content.replace(
        /<Card className="lg:col-span-2 ([^"]*?)shadow-sm">/g,
        '<Card className="lg:col-span-2 $1shadow-sm flex flex-col h-full">'
    );
    content = content.replace(
        /<Card className="lg:col-span-1 ([^"]*?)flex flex-col">/g,
        '<Card className="lg:col-span-1 $1flex flex-col h-full">'
    );

    fs.writeFileSync(filePath, content);
    console.log('Successfully updated', filePath);
}

updateDashboard('c:/Users/pottabathini meghana/Downloads/AI_Adaptive_Interview/Front-end/src/pages/superadmin/SuperDashboardPage.jsx');
