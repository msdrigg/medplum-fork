import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_wafv2 as wafv2,
  Duration,
} from 'aws-cdk-lib';
import { ServerlessClamscan } from 'cdk-serverless-clamscan';
import { Construct } from 'constructs';
import { MedplumInfraConfig } from './config';
import { awsManagedRules } from './waf';

/**
 * Binary storage bucket and CloudFront distribution.
 */
export class Storage extends Construct {
  constructor(parent: Construct, config: MedplumInfraConfig) {
    super(parent, 'Storage');

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: config.domainName,
    });

    // S3 bucket
    const storageBucket = new s3.Bucket(this, 'StorageBucket', {
      bucketName: config.storageBucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });

    if (config.clamscanEnabled) {
      // ClamAV serverless scan
      const sc = new ServerlessClamscan(this, 'ServerlessClamscan', {
        defsBucketAccessLogsConfig: {
          logsBucket: s3.Bucket.fromBucketName(this, 'LoggingBucket', config.clamscanLoggingBucket),
          logsPrefix: config.clamscanLoggingPrefix,
        },
      });
      sc.addSourceBucket(storageBucket);
    }

    // Public key in PEM format
    const publicKey = new cloudfront.PublicKey(this, 'StoragePublicKey', {
      encodedKey: config.storagePublicKey,
    });

    // Authorized key group for presigned URLs
    const keyGroup = new cloudfront.KeyGroup(this, 'StorageKeyGroup', {
      items: [publicKey],
    });

    // HTTP response headers policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *.medplum.com;",
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(63072000),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
    });

    // WAF
    const waf = new wafv2.CfnWebACL(this, 'StorageWAF', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      name: `${config.stackName}-StorageWAF`,
      rules: awsManagedRules,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${config.stackName}-StorageWAF-Metric`,
        sampledRequestsEnabled: false,
      },
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'StorageDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(storageBucket),
        responseHeadersPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        trustedKeyGroups: [keyGroup],
      },
      certificate: acm.Certificate.fromCertificateArn(this, 'StorageCertificate', config.storageSslCertArn),
      domainNames: [config.storageDomainName],
      webAclId: waf.attrArn,
    });

    // Route53 alias record for the CloudFront distribution
    const record = new route53.ARecord(this, 'StorageAliasRecord', {
      recordName: config.storageDomainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone,
    });

    // Debug
    console.log('ARecord', record.domainName);
  }
}
