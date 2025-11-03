// ============================================
// TELEGRAM BOT API - SERVERLESS FUNCTION
// ============================================
// Этот файл можно использовать для:
// - Vercel Functions (api/telegram.js)
// - Netlify Functions (netlify/functions/telegram.js)
// - Express.js backend
// ============================================

/**
 * Обработчик запроса для отправки сообщения в Telegram
 * 
 * Использование:
 * POST /api/telegram
 * Body: { name, email, company, message }
 */

export default async function handler(req, res) {
    // Логируем входящий запрос для отладки
    console.log('📥 Incoming request:', {
        method: req.method,
        url: req.url,
        headers: {
            'content-type': req.headers['content-type'],
            'origin': req.headers['origin'],
            'user-agent': req.headers['user-agent']?.substring(0, 50)
        }
    });

    // Устанавливаем CORS заголовки для всех ответов (важно ставить ДО проверки метода)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Обработка CORS preflight запросов (OPTIONS)
    if (req.method === 'OPTIONS') {
        console.log('✅ Handling OPTIONS preflight request');
        return res.status(200).end();
    }

    // Разрешаем только POST запросы (OPTIONS уже обработан выше)
    if (req.method !== 'POST') {
        console.error('❌ Invalid method:', req.method);
        return res.status(405).json({ 
            success: false,
            error: `Method not allowed. Use POST. Received: ${req.method}` 
        });
    }

    console.log('✅ POST request received');

    try {
        // Парсим тело запроса (Vercel может передавать как объект или строку)
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (parseError) {
                console.error('❌ Error parsing request body:', parseError);
                return res.status(400).json({
                    success: false,
                    error: 'Invalid JSON in request body'
                });
            }
        }
        
        // Получаем данные из тела запроса
        const { name, email, company, message } = body || {};

        // Валидация обязательных полей
        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, email, message'
            });
        }

        // Валидация email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Получаем токен бота и Chat ID из переменных окружения
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        let CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        // Логирование для отладки (без токена)
        console.log('Telegram configuration check:');
        console.log('- BOT_TOKEN exists:', !!BOT_TOKEN);
        console.log('- BOT_TOKEN length:', BOT_TOKEN ? BOT_TOKEN.length : 0);
        console.log('- CHAT_ID exists:', !!CHAT_ID);
        console.log('- CHAT_ID value:', CHAT_ID ? '***' : 'missing');

        // Проверка наличия конфигурации
        if (!BOT_TOKEN || !CHAT_ID) {
            console.error('❌ Telegram configuration missing');
            console.error('- BOT_TOKEN:', BOT_TOKEN ? 'SET' : 'MISSING');
            console.error('- CHAT_ID:', CHAT_ID ? 'SET' : 'MISSING');
            return res.status(500).json({
                success: false,
                error: 'Telegram bot not configured. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.'
            });
        }

        // Преобразуем Chat ID в число (Telegram API принимает и строку и число, но лучше число)
        // Обрабатываем случай, когда Chat ID отрицательный (для групп)
        const chatIdNum = Number(CHAT_ID);
        if (isNaN(chatIdNum)) {
            console.error('❌ Invalid CHAT_ID format:', CHAT_ID);
            return res.status(500).json({
                success: false,
                error: 'Invalid CHAT_ID format. Must be a number.'
            });
        }

        console.log('✅ Configuration valid');
        console.log('📝 Form data received:', {
            name: name.substring(0, 20) + '...',
            email: email.substring(0, 20) + '...',
            company: company ? company.substring(0, 20) + '...' : 'not provided',
            messageLength: message.length
        });

        // Формируем структурированное сообщение
        const telegramMessage = formatTelegramMessage(name, email, company, message);
        console.log('📨 Formatted Telegram message length:', telegramMessage.length);

        // Отправляем сообщение в Telegram через Bot API
        console.log('🚀 Sending message to Telegram API...');
        const telegramResponse = await sendTelegramMessage(
            BOT_TOKEN,
            chatIdNum,
            telegramMessage
        );

        console.log('📥 Telegram API response received:');
        console.log('- ok:', telegramResponse.ok);
        console.log('- error_code:', telegramResponse.error_code);
        console.log('- description:', telegramResponse.description);

        // Проверяем успешность отправки
        if (telegramResponse.ok) {
            console.log('✅ Telegram message sent successfully!');
            console.log('- Message ID:', telegramResponse.result.message_id);
            return res.status(200).json({
                success: true,
                message: 'Telegram notification sent successfully',
                messageId: telegramResponse.result.message_id
            });
        } else {
            const errorMsg = `Telegram API error: ${telegramResponse.error_code || 'unknown'} - ${telegramResponse.description || 'Unknown error'}`;
            console.error('❌ Telegram API error:', errorMsg);
            throw new Error(errorMsg);
        }

    } catch (error) {
        console.error('❌ Error sending Telegram notification:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: 'Failed to send Telegram notification',
            details: error.message || 'Unknown error',
            errorCode: error.code
        });
    }
}

/**
 * Форматирует сообщение для Telegram в структурированном виде
 */
function formatTelegramMessage(name, email, company, message) {
    const now = new Date();
    const dateTime = now.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    let formattedMessage = `🎯 <b>Новая заявка с сайта Кассиопея AI</b>\n\n`;
    formattedMessage += `👤 <b>Имя:</b> ${escapeHtml(name)}\n`;
    formattedMessage += `📧 <b>Email:</b> ${escapeHtml(email)}\n`;
    
    if (company && company.trim()) {
        formattedMessage += `🏢 <b>Компания:</b> ${escapeHtml(company)}\n`;
    }
    
    formattedMessage += `\n💬 <b>Сообщение:</b>\n${escapeHtml(message)}\n\n`;
    formattedMessage += `📅 <b>Отправлено:</b> ${dateTime}`;

    return formattedMessage;
}

/**
 * Отправляет сообщение в Telegram через Bot API
 */
async function sendTelegramMessage(botToken, chatId, text) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    console.log('📡 Calling Telegram Bot API...');
    console.log('- URL:', url.replace(botToken, 'TOKEN_HIDDEN'));
    console.log('- Chat ID:', chatId);
    console.log('- Message length:', text.length);
    
    const requestBody = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
    
    console.log('📤 Request body (chat_id only):', { chat_id: chatId, text_length: text.length });

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        const responseData = await response.json();
        
        console.log('📥 Telegram API raw response:');
        console.log('- Status:', response.status);
        console.log('- Status text:', response.statusText);
        console.log('- Response data:', JSON.stringify(responseData).substring(0, 200));

        return responseData;
    } catch (fetchError) {
        console.error('❌ Fetch error:', fetchError);
        throw new Error(`Failed to call Telegram API: ${fetchError.message}`);
    }
}

/**
 * Экранирует HTML-символы для безопасности
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================
// АЛЬТЕРНАТИВНЫЙ ВАРИАНТ ДЛЯ EXPRESS.JS
// ============================================
// Если используете Express.js, используйте этот код:
/*
const express = require('express');
const router = express.Router();

router.post('/telegram', async (req, res) => {
    // Используйте код из функции handler выше
});

module.exports = router;
*/

