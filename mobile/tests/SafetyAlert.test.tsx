import React from 'react';
import { render } from '@testing-library/react-native';
import { SafetyAlert } from '@/components/SafetyAlert';
import { ThemeProvider } from '@/theme/ThemeProvider';

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('SafetyAlert', () => {
  it('states the observation and points to protocol without diagnosing', () => {
    const { getByText, queryByText } = wrap(
      <SafetyAlert flag={{ flagged: true, note: 'Player 12 took helmet contact and was slow to rise.' }} />,
    );
    expect(getByText('Possible head contact')).toBeTruthy();
    expect(getByText(/slow to rise/)).toBeTruthy();
    expect(getByText(/concussion protocol/i)).toBeTruthy();
    // It is explicitly not a diagnosis.
    expect(getByText(/not a medical diagnosis/i)).toBeTruthy();
    expect(queryByText(/diagnosis:/i)).toBeNull();
  });

  it('renders nothing when not flagged', () => {
    const { toJSON } = wrap(<SafetyAlert flag={{ flagged: false, note: '' }} />);
    expect(toJSON()).toBeNull();
  });
});
