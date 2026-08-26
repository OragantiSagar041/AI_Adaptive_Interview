import React from 'react';

export function AdminShell({ title, description, actions, children }) {
  return (
    <div className="p-6 md:p-8 w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1 text-slate-500">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      <div className="space-y-8">
        {children}
      </div>
    </div>
  );
}
