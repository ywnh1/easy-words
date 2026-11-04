import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Link,
  Separator,
  Text,
} from "@radix-ui/themes";
import { ArrowLeft, GithubLogo } from "@phosphor-icons/react";
import { APP, issuesUrl, repoUrl } from "../lib/meta";

/** 一行信息：标签在上，值在下。手机上比两列表格好读。 */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text size="1" color="gray" mb="1" style={{ display: "block" }}>
        {label}
      </Text>
      {children}
    </Box>
  );
}

export function About({ onBack }: { onBack: () => void }) {
  const repo = repoUrl();
  const issues = issuesUrl();

  return (
    <Box className="safe-top safe-bottom safe-x" px="3" py="3" style={{ minHeight: "100dvh" }}>
      <Flex align="center" gap="2" mb="4">
        <Button
          variant="ghost"
          color="gray"
          size="2"
          onClick={onBack}
          aria-label="返回首页"
        >
          <ArrowLeft size={20} />
        </Button>
        <Heading size="5">关于</Heading>
      </Flex>

      <Flex direction="column" gap="4" style={{ maxWidth: 560, margin: "0 auto" }}>
        <Card size="3" variant="surface">
          <Heading size="6" mb="1">
            {APP.name}
          </Heading>
          <Text size="2" color="gray" mb="4" style={{ display: "block" }}>
            {APP.tagline} · v{APP.version}
          </Text>

          <Separator size="4" mb="4" />

          <Flex direction="column" gap="4">
            <Item label="开源协议">
              <Link href={APP.licenseUrl} target="_blank" size="2">
                {APP.license}
              </Link>
              <Text size="1" color="gray" style={{ display: "block" }} mt="1">
                可自由使用、修改、分发，需保留版权声明
              </Text>
            </Item>

            <Item label="源代码">
              {repo ? (
                <Link href={repo} target="_blank" size="2">
                  <Flex align="center" gap="1" as="span" style={{ display: "inline-flex" }}>
                    <GithubLogo size={15} />
                    {repo.replace(/^https?:\/\//, "")}
                  </Flex>
                </Link>
              ) : (
                <Text size="2" color="gray">
                  待填写
                </Text>
              )}
            </Item>

            <Item label="问题反馈">
              {issues ? (
                <Link href={issues} target="_blank" size="2">
                  {issues.replace(/^https?:\/\//, "")}
                </Link>
              ) : (
                <Text size="2" color="gray">
                  待填写
                </Text>
              )}
            </Item>

            <Item label="作者">
              <Text size="2">{APP.author}</Text>
            </Item>

            <Separator size="4" />

            <Item label="词库来源">
              <Text size="2" style={{ lineHeight: 1.6 }}>
                外研社《高中英语》必修第一、二、三册与选择性必修第一册
              </Text>
            </Item>

            <Item label="例句来源">
              <Text size="2" style={{ lineHeight: 1.6 }}>
                牛津高阶英汉双解、柯林斯 COBUILD，以及按高中水平自撰的补充例句
              </Text>
            </Item>
          </Flex>
        </Card>

        <Text size="1" color="gray" style={{ lineHeight: 1.7, paddingInline: 4 }}>
          本应用仅用于学习与教学。教材词汇表由扫描件转录，「例句」「释义」等内容的著作权
          归原出版方所有，请勿用于商业用途。如权利人认为有不妥之处，请通过上方的问题反馈联系。
        </Text>
      </Flex>
    </Box>
  );
}
