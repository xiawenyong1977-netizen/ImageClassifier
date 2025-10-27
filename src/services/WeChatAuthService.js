/**
 * WeChatAuthService - 微信授权服务
 * 
 * 功能：
 * 1. 生成二维码（POST /api/v1/auth/wechat/qrcode）
 * 2. 检查关注状态（GET /api/v1/auth/wechat/check-follow）
 * 3. 查询额度（GET /api/v1/user/credits）
 * 
 * 使用场景：
 * - 用户首次使用AI图像增强功能前，需先关注公众号获取免费额度
 * - 在设置页面显示二维码和关注状态
 * - 提交增强任务前检查用户额度是否充足
 */

import { logger } from '../adapters/WebAdapters';
import ImageStorageService from './ImageStorageService';

class WeChatAuthService {
  constructor() {
    this.apiConfig = {
      baseURL: 'https://www.xintuxiangce.top',
      endpoints: {
        qrcode: '/api/v1/auth/wechat/qrcode',
        checkFollow: '/api/v1/auth/wechat/check-follow',
        credits: '/api/v1/user/credits'
      },
      timeout: 30000 // 30秒超时
    };
    this.imageStorageService = new ImageStorageService();
  }

  // ========== 工具方法 ==========
  
  /**
   * 获取客户端ID
   * @returns {Promise<string>} 客户端ID
   */
  async getClientId() {
    try {
      const settings = await this.imageStorageService.getSettings();
      return settings.clientId || '';
    } catch (error) {
      logger.error('❌ 获取客户端ID失败:', error);
      return '';
    }
  }

  /**
   * 保存 openID 到本地设置
   * @param {string} openId 
   */
  async saveOpenId(openId) {
    try {
      const settings = await this.imageStorageService.getSettings();
      settings.wechatOpenId = openId;
      await this.imageStorageService.saveSettings(settings);
      logger.debug('✅ openID 已保存');
    } catch (error) {
      logger.error('❌ 保存openID失败:', error);
    }
  }

  /**
   * 获取本地保存的 openID
   * @returns {Promise<string>} openID
   */
  async getOpenId() {
    try {
      const settings = await this.imageStorageService.getSettings();
      return settings.wechatOpenId || '';
    } catch (error) {
      logger.error('❌ 获取openID失败:', error);
      return '';
    }
  }

  // ========== API 交互 ==========
  
  /**
   * 生成二维码
   * @returns {Promise<{qrcode: string, ticket: string}>}
   */
  async generateQrCode() {
    try {
      const clientId = await this.getClientId();
      
      if (!clientId) {
        throw new Error('客户端ID未找到，请重新安装应用');
      }

      logger.debug('📱 正在生成二维码...');

      const url = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.qrcode}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.apiConfig.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': clientId
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`❌ 生成二维码失败 (${response.status}):`, errorText);
        throw new Error(`生成二维码失败: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        logger.debug('✅ 二维码生成成功');
        return {
          qrcode: result.data.qrcode, // Base64 编码的二维码图片
          ticket: result.data.ticket  // 二维码票据
        };
      } else {
        throw new Error(result.message || '生成二维码失败');
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error('❌ 生成二维码超时');
        throw new Error('生成二维码超时，请检查网络连接');
      }
      logger.error('❌ 生成二维码失败:', error);
      throw error;
    }
  }

  /**
   * 检查关注状态
   * @param {string} ticket - 二维码票据
   * @returns {Promise<{followed: boolean, openId: string}>}
   */
  async checkFollowStatus(ticket) {
    try {
      const clientId = await this.getClientId();
      
      if (!clientId) {
        throw new Error('客户端ID未找到');
      }

      if (!ticket) {
        throw new Error('二维码票据缺失');
      }

      logger.debug('🔍 正在检查关注状态...');

      const url = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.checkFollow}?ticket=${ticket}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.apiConfig.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Client-Id': clientId
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`❌ 检查关注状态失败 (${response.status}):`, errorText);
        throw new Error(`检查关注状态失败: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const { followed, openId } = result.data;
        
        if (followed && openId) {
          // 保存 openId 到本地
          await this.saveOpenId(openId);
          logger.debug('✅ 用户已关注，openId已保存');
        }
        
        return {
          followed: followed || false,
          openId: openId || ''
        };
      } else {
        return { followed: false, openId: '' };
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error('❌ 检查关注状态超时');
        throw new Error('检查关注状态超时，请检查网络连接');
      }
      logger.error('❌ 检查关注状态失败:', error);
      throw error;
    }
  }

  /**
   * 查询用户额度
   * @returns {Promise<{total: number, used: number, remaining: number}>}
   */
  async getCredits() {
    try {
      const clientId = await this.getClientId();
      const openId = await this.getOpenId();
      
      if (!clientId) {
        throw new Error('客户端ID未找到');
      }

      if (!openId) {
        // 没有 openId 表示未关注，返回0额度
        return { total: 0, used: 0, remaining: 0 };
      }

      logger.debug('💰 正在查询额度...');

      const url = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.credits}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.apiConfig.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Client-Id': clientId,
          'X-WeChat-OpenID': openId
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`❌ 查询额度失败 (${response.status}):`, errorText);
        throw new Error(`查询额度失败: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const { total, used, remaining } = result.data;
        logger.debug(`✅ 额度查询成功: 总计${total}，已用${used}，剩余${remaining}`);
        return {
          total: total || 0,
          used: used || 0,
          remaining: remaining || 0
        };
      } else {
        return { total: 0, used: 0, remaining: 0 };
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error('❌ 查询额度超时');
        throw new Error('查询额度超时，请检查网络连接');
      }
      logger.error('❌ 查询额度失败:', error);
      return { total: 0, used: 0, remaining: 0 };
    }
  }

  /**
   * 轮询检查关注状态
   * @param {string} ticket - 二维码票据
   * @param {Function} onFollowed - 关注成功回调
   * @param {Function} onError - 错误回调
   * @returns {Function} 停止轮询的函数
   */
  startCheckingFollowStatus(ticket, onFollowed, onError) {
    let isPolling = true;
    
    const checkInterval = setInterval(async () => {
      if (!isPolling) return;
      
      try {
        const { followed, openId } = await this.checkFollowStatus(ticket);
        
        if (followed && openId) {
          clearInterval(checkInterval);
          isPolling = false;
          
          if (onFollowed) {
            onFollowed({ followed: true, openId });
          }
        }
      } catch (error) {
        // 轮询中的错误不需要中断轮询，仅记录日志
        logger.debug('⏳ 轮询中...', error.message);
      }
    }, 2000); // 每2秒检查一次

    // 返回停止函数
    return () => {
      clearInterval(checkInterval);
      isPolling = false;
    };
  }
}

export default new WeChatAuthService();

