// testWaitForTimeout.js

import * as puppeteer from 'puppeteer';
// 또는 기본 임포트 사용 시:
// import puppeteer from 'puppeteer';

const testWaitForTimeout = async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.google.com', { waitUntil: 'networkidle0' });
    console.log('페이지에 정상적으로 접근했습니다.');

    console.log('10초 대기 시작...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // 대안 2 사용
    console.log('10초 대기 완료.');
  } catch (error) {
    console.error('에러 발생:', error);
  } finally {
    await browser.close();
  }
};

testWaitForTimeout();
