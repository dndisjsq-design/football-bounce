import { director, Node } from 'cc';
import { authMessage, loginAsGuest, loginWithPassword } from '../services/AuthService';
import { onTap, onTapExpanded } from '../utils/CocosNodeUtils';
import { ensureEditBox } from '../utils/EditBoxUtils';
import { setAuthMessage } from './AuthSceneHelpers';

export function bindLoginScene(root: Node): void {
  const usernameInput = ensureEditBox(root, 'InputAccount', '', false);
  const passwordInput = ensureEditBox(root, 'InputPassword', '', true);
  setAuthMessage(root, 'TextHint', '');
  onTapExpanded(root, 'ButtonRegister', 16, 12, () => director.loadScene('Register'));
  onTap(root, 'ButtonGuestLogin', () => {
    loginAsGuest();
    director.loadScene('Home');
  });
  onTap(root, 'ButtonLogin', () => {
    const username = (usernameInput?.string || '').trim();
    const password = passwordInput?.string || '';
    if (!username || !password) {
      setAuthMessage(root, 'TextHint', '请输入账号和密码', false);
      return;
    }
    setAuthMessage(root, 'TextHint', '登录中...', true);
    void loginWithPassword(username, password).then((response) => {
      if (response.code === 'SUCCESS') {
        director.loadScene('Home');
        return;
      }
      setAuthMessage(root, 'TextHint', authMessage(response), false);
    }).catch((error: Error) => {
      setAuthMessage(root, 'TextHint', error.message || '无法连接服务器', false);
    });
  });
}
