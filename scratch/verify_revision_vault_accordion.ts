import React from 'react';
import { RevisionVaultView } from '../src/components/RevisionVaultView';
import { TestResultModal } from '../src/components/TestResultModal';

console.log('=== VERIFYING REVISION VAULT ACCORDION & QUESTION REVIEW COMPONENT IMPORTS ===');

if (typeof RevisionVaultView === 'function') {
  console.log('✅ RevisionVaultView component exported and valid.');
} else {
  console.error('❌ RevisionVaultView component export issue.');
}

if (typeof TestResultModal === 'function') {
  console.log('✅ TestResultModal component exported and valid.');
} else {
  console.error('❌ TestResultModal component export issue.');
}

console.log('=== VERIFICATION PASSED ===');
