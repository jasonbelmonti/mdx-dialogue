import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
export default function GraphDocumentViewer() {
  return (
    <BrowserOnly fallback={<p>Loading the interactive document…</p>}>
      {() => {
        const Viewer = require('./LiveGraphDocument').default;
        return <Viewer />;
      }}
    </BrowserOnly>
  );
}
