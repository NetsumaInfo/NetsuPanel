import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeSwitch } from '@app/components/ModeSwitch';

describe('ModeSwitch', () => {
  it('calls onChange when switching mode', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { getByRole } = render(<ModeSwitch value="manga" onChange={onChange} />);

    await user.click(getByRole('button', { name: 'Mode Général' }));

    expect(onChange).toHaveBeenCalledWith('general');
  });
});
