import { CircleCheck, FileText, Plus, RotateCw } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Example, Section } from './section';

export function DisplaySection() {
  return (
    <Section id="display" title="Data display">
      <Example title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Draft</Badge>
          <Badge variant="outline">Soon</Badge>
          <Badge variant="accent">Selected</Badge>
          <Badge variant="success">
            <CircleCheck aria-hidden />
            Published
          </Badge>
          <Badge variant="warning">Closing soon</Badge>
          <Badge variant="danger">Closed</Badge>
          <Badge variant="neutral">1,204</Badge>
        </div>
      </Example>
      <div className="grid gap-4 md:grid-cols-2">
        <Example title="Card" className="border-none p-0 md:p-0">
          <Card>
            <CardHeader>
              <CardTitle as="h4">Customer survey</CardTitle>
              <CardDescription>Updated 2 hours ago</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-13 text-muted-foreground">Responses</dt>
                  <dd className="text-24 font-semibold tracking-tight tabular-nums">1,204</dd>
                </div>
                <div>
                  <dt className="text-13 text-muted-foreground">Completion</dt>
                  <dd className="text-24 font-semibold tracking-tight tabular-nums">86%</dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter>
              <Badge variant="success">Published</Badge>
              <Button variant="ghost" size="sm" className="ml-auto">
                Open
              </Button>
            </CardFooter>
          </Card>
        </Example>
        <Example title="Loading skeleton" className="border-none p-0 md:p-0">
          <Card aria-busy="true" aria-label="Loading form">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-28" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-16" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Skeleton className="h-5 w-20" />
            </CardFooter>
          </Card>
        </Example>
      </div>
      <Example title="Tabs">
        <div className="flex flex-col gap-8">
          <Tabs defaultValue="build">
            <TabsList aria-label="Segmented example">
              <TabsTrigger value="build">Build</TabsTrigger>
              <TabsTrigger value="share">Share</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Disabled
              </TabsTrigger>
            </TabsList>
            <TabsContent value="build" className="text-14 text-muted-foreground">
              Segmented tabs switch between views of the same object.
            </TabsContent>
            <TabsContent value="share" className="text-14 text-muted-foreground">
              Share panel.
            </TabsContent>
            <TabsContent value="results" className="text-14 text-muted-foreground">
              Results panel.
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="summary">
            <TabsList variant="underline" aria-label="Underline example">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="responses">Responses</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="text-14 text-muted-foreground">
              Underline tabs work for page-level sections.
            </TabsContent>
            <TabsContent value="responses" className="text-14 text-muted-foreground">
              Responses panel.
            </TabsContent>
            <TabsContent value="insights" className="text-14 text-muted-foreground">
              Insights panel.
            </TabsContent>
          </Tabs>
        </div>
      </Example>
      <Example title="Separator">
        <div className="flex flex-col gap-4 text-14">
          <p>Above the separator</p>
          <Separator />
          <div className="flex h-5 items-center gap-4">
            <span>Build</span>
            <Separator orientation="vertical" />
            <span>Share</span>
            <Separator orientation="vertical" />
            <span>Results</span>
          </div>
        </div>
      </Example>
    </Section>
  );
}

export function StatesSection() {
  return (
    <Section
      id="states"
      title="Empty and error states"
      description="Every data view pairs a loading skeleton with these."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <EmptyState
          icon={FileText}
          title="No forms yet"
          description="Create your first form to start collecting responses."
          action={
            <Button size="sm">
              <Plus aria-hidden />
              Create form
            </Button>
          }
        />
        <ErrorState
          description="We could not load your forms."
          action={
            <Button size="sm" variant="secondary">
              <RotateCw aria-hidden />
              Try again
            </Button>
          }
        />
      </div>
    </Section>
  );
}
