import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';

const PRIVACY_POLICY_URL = 'https://www.xintuxiangce.top/privacy-policy.html';
const PRIVACY_AGREED_KEY = '@privacy_policy_agreed';

const PrivacyPolicyModal = ({ visible, onAgree, onDisagree }) => {
  const { t } = useTranslation('common');
  const [agreed, setAgreed] = useState(false);

  const handleOpenPolicy = async () => {
    try {
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (supported) {
        await Linking.openURL(PRIVACY_POLICY_URL);
      } else {
        console.error('无法打开隐私政策链接');
      }
    } catch (error) {
      console.error('打开隐私政策链接失败:', error);
    }
  };

  const handleAgree = () => {
    if (agreed) {
      onAgree();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={() => {}} // Android 返回键禁用
    >
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>{t('privacy.title')}</Text>
          <Text style={styles.welcome}>{t('privacy.welcome')}</Text>
          <Text style={styles.description}>{t('privacy.description')}</Text>
          
          <View style={styles.policyLinkContainer}>
            <Text style={styles.policyText}>
              {t('privacy.readPolicy')}{' '}
              <Text style={styles.policyLink} onPress={handleOpenPolicy}>
                {t('privacy.privacyPolicy')}
              </Text>
            </Text>
          </View>

          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setAgreed(!agreed)}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <View style={styles.checkboxInner} />}
            </View>
            <Text style={styles.checkboxLabel}>
              {t('privacy.readPolicy')} {t('privacy.privacyPolicy')}
            </Text>
          </TouchableOpacity>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.agreeButton, !agreed && styles.buttonDisabled]}
              onPress={handleAgree}
              disabled={!agreed}
            >
              <Text style={[styles.buttonText, styles.agreeButtonText]}>
                {t('privacy.agree')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 16,
    textAlign: 'center',
  },
  welcome: {
    fontSize: 18,
    color: '#666666',
    marginBottom: 24,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666666',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  policyLinkContainer: {
    width: '100%',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  policyText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
    textAlign: 'center',
  },
  policyLink: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
    width: '100%',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    borderRadius: 4,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    borderColor: '#007AFF',
    backgroundColor: '#007AFF',
  },
  checkboxInner: {
    width: 6,
    height: 10,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
    marginTop: -2,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333333',
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: 16,
  },
  button: {
    width: '100%',
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
  },
  buttonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  agreeButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  agreeButtonText: {
    color: '#FFFFFF',
  },
});

export default PrivacyPolicyModal;
export { PRIVACY_AGREED_KEY };
